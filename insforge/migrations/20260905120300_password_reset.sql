-- कामगार — पासवर्ड रीसेट + पासवर्ड बदलें
--
-- Users log in with their mobile number; their "email" is the internal alias
-- 91XXXXXXXXXX@mobile.kaamgaar.app, so InsForge's email-based reset cannot
-- deliver a code to anyone. Reset here is therefore:
--
--   1. user requests a reset with their mobile number (public, rate-limited)
--   2. an admin approves it — the backend sets a one-time temporary password
--      (bcrypt via pgcrypto crypt/gen_salt('bf'), verified compatible with the
--      InsForge sign-in endpoint) and stores it on the request row
--   3. the user (who kept the request page open) sees the temporary password,
--      logs in with it, and is pushed to set a new password
--   4. change_my_password verifies the current password with crypt() and sets
--      the new one; it also marks the reset request consumed
--
-- The request id is a bearer credential (returned only to the requester and
-- kept in localStorage on their device). Pending requests expire after 24h.

-- ------------------------------------------------------------- table
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','consumed')),
  temp_password TEXT,
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pwr_user_idx ON public.password_reset_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pwr_status_idx ON public.password_reset_requests (status, created_at DESC);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_requests FROM anon, authenticated;
-- no policies at all: every access goes through the SECURITY DEFINER functions
-- below (the function owner bypasses RLS).

-- ------------------------------------------------- temp password generator
-- 12 chars from an unambiguous alphabet (no 0/O/1/I/l) — a one-time password,
-- entropy is ample for a 24h window with rate limiting.
CREATE OR REPLACE FUNCTION public.temp_password_gen()
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  chars TEXT := 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  pw    TEXT := '';
  i     INT;
BEGIN
  FOR i IN 1..12 LOOP
    pw := pw || substr(chars, 1 + (get_byte(gen_random_bytes(1), 0) % length(chars)), 1);
  END LOOP;
  RETURN pw;
END $$;

-- ================================================= user: request a reset
-- Public (user is logged out by definition). Returns the request id — the
-- bearer credential the user keeps in localStorage and polls with.
CREATE OR REPLACE FUNCTION public.request_password_reset(p_mobile_raw TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mobile   TEXT;
  u        RECORD;
  existing UUID;
  recent   INT;
  rid      UUID;
BEGIN
  mobile := NULLIF(regexp_replace(COALESCE(p_mobile_raw, ''), '\D', '', 'g'), '');
  IF length(mobile) <> 10 THEN
    RAISE EXCEPTION 'कृपया सही 10 अंकों का मोबाइल नंबर लिखें';
  END IF;

  SELECT u.id, p.name, p.role INTO u
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE p.phone = mobile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'यह मोबाइल नंबर हमारे रिकॉर्ड में नहीं मिला। नंबर जांचकर दोबारा लिखें।';
  END IF;

  -- idempotent: reuse a fresh pending request (user may re-tap the button)
  SELECT id INTO existing
    FROM public.password_reset_requests
   WHERE user_id = u.id AND status = 'pending' AND created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN json_build_object('request_id', existing, 'name', u.name, 'role', u.role, 'status', 'pending');
  END IF;

  -- rate limit: max 3 requests per 7 days (nagging/spam protection)
  SELECT count(*) INTO recent
    FROM public.password_reset_requests
   WHERE user_id = u.id AND created_at > NOW() - INTERVAL '7 days';
  IF recent >= 3 THEN
    RAISE EXCEPTION 'इस अकाउंट के लिए बहुत सारी रिक्वेस्ट हो चुकी हैं। कल फिर कोशिश करें।';
  END IF;

  INSERT INTO public.password_reset_requests (user_id, mobile)
  VALUES (u.id, mobile)
  RETURNING id INTO rid;

  RETURN json_build_object('request_id', rid, 'name', u.name, 'role', u.role, 'status', 'pending');
END $$;

-- ============================================ user: poll own request (bearer id)
-- The request id is unguessable and was only ever returned to the requester's
-- browser. Pending requests expire after 24 hours.
CREATE OR REPLACE FUNCTION public.get_password_reset_request(p_request_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.password_reset_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'रिक्वेस्ट नहीं मिली';
  END IF;
  IF r.status = 'pending' AND r.created_at < NOW() - INTERVAL '24 hours' THEN
    RETURN json_build_object('status', 'expired');
  END IF;
  IF r.status = 'approved' THEN
    RETURN json_build_object('status', 'approved',
                             'temp_password', r.temp_password,
                             'resolved_at', r.resolved_at);
  END IF;
  RETURN json_build_object('status', r.status,
                           'admin_note', r.admin_note,
                           'resolved_at', r.resolved_at);
END $$;

-- ======================================================= admin: list
CREATE OR REPLACE FUNCTION public.admin_reset_requests(p_status TEXT DEFAULT 'pending', p_limit INTEGER DEFAULT 50)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json)
    FROM (
      SELECT r.id, r.mobile, p.name AS user_name, p.role AS user_role,
             r.status, r.admin_note, r.created_at, r.resolved_at
        FROM public.password_reset_requests r
        JOIN public.profiles p ON p.id = r.user_id
       WHERE (p_status = 'all' OR r.status = p_status)
       ORDER BY r.created_at DESC
       LIMIT COALESCE(p_limit, 50)
    ) x
  );
END $$;

-- ============================================== admin: approve (sets temp pw)
CREATE OR REPLACE FUNCTION public.admin_approve_reset_request(p_request_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r RECORD; pw TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  SELECT * INTO r FROM public.password_reset_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'रिक्वेस्ट नहीं मिली'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'यह रिक्वेस्ट पहले से प्रोसेस हो चुकी है'; END IF;
  IF r.created_at < NOW() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'रिक्वेस्ट 24 घंटे पुरानी है — यूज़र को नई रिक्वेस्ट करानी होगी';
  END IF;

  pw := public.temp_password_gen();
  -- set the new (temporary) password — bcrypt, verified compatible with sign-in
  UPDATE auth.users SET password = crypt(pw, gen_salt('bf', 10)) WHERE id = r.user_id;
  UPDATE public.password_reset_requests
     SET status = 'approved', temp_password = pw, resolved_at = NOW()
   WHERE id = r.id;

  PERFORM public.notify_user(r.user_id, 'password_reset', 'पासवर्ड रीसेट तैयार है 🔑',
    'आपका पासवर्ड रीसेट हो गया है। लॉगिन के बाद तुरंत अपना नया पासवर्ड सेट करें।',
    '/change-password');

  RETURN json_build_object('status', 'approved');
END $$;

-- ==================================================== admin: reject
CREATE OR REPLACE FUNCTION public.admin_reject_reset_request(p_request_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  SELECT * INTO r FROM public.password_reset_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'रिक्वेस्ट नहीं मिली'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'यह रिक्वेस्ट पहले से प्रोसेस हो चुकी है'; END IF;
  UPDATE public.password_reset_requests
     SET status = 'rejected', admin_note = NULLIF(TRIM(COALESCE(p_note, '')), ''), resolved_at = NOW()
   WHERE id = r.id;
  RETURN json_build_object('status', 'rejected');
END $$;

-- ============================================ user: change my own password
-- Verify the current password with crypt() against the stored bcrypt hash,
-- then set the new one. Also consumes any approved reset request, so the
-- temporary password stops being visible after the user picks their own.
CREATE OR REPLACE FUNCTION public.change_my_password(p_current TEXT, p_new TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  uid UUID := auth.uid();
  h   TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'लॉगिन आवश्यक है'; END IF;
  SELECT password INTO h FROM auth.users WHERE id = uid;
  IF h IS NULL OR h NOT LIKE '$2%' OR h <> crypt(COALESCE(p_current, ''), h) THEN
    RAISE EXCEPTION 'मौजूदा पासवर्ड गलत है';
  END IF;
  IF p_new IS NULL OR p_new = p_current THEN
    RAISE EXCEPTION 'नया पासवर्ड मौजूदा पासवर्ड जैसा नहीं होना चाहिए';
  END IF;
  -- match the platform password policy
  IF length(p_new) < 6 THEN RAISE EXCEPTION 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए'; END IF;
  IF p_new !~ '[0-9]' THEN RAISE EXCEPTION 'पासवर्ड में कम से कम एक अंक होना चाहिए'; END IF;
  IF p_new !~ '[a-z]' THEN RAISE EXCEPTION 'पासवर्ड में कम से कम एक छोटा अक्षर होना चाहिए'; END IF;

  UPDATE auth.users SET password = crypt(p_new, gen_salt('bf', 10)) WHERE id = uid;

  UPDATE public.password_reset_requests
     SET status = 'consumed', resolved_at = COALESCE(resolved_at, NOW())
   WHERE user_id = uid AND status = 'approved';

  RETURN json_build_object('ok', TRUE);
END $$;

-- ------------------------------------------------------------- grants
GRANT EXECUTE ON FUNCTION public.request_password_reset(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_password_reset_request(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_my_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.temp_password_gen() TO authenticated;
-- admin RPCs: callable by any authenticated session, authorised inside (same pattern as the other admin_*)
REVOKE ALL ON FUNCTION public.admin_reset_requests(TEXT, INTEGER),
  public.admin_approve_reset_request(UUID),
  public.admin_reject_reset_request(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_requests(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_reset_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_reset_request(UUID, TEXT) TO authenticated;
