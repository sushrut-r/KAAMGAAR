-- =====================================================================
-- Fix for 20260905120300: `IF r IS NULL` after a no-row SELECT INTO
-- fails on this PostgreSQL with "record r is not assigned yet".
-- The reliable idiom is `IF NOT FOUND` right after the SELECT INTO.
-- Re-creates the four affected functions only.
-- =====================================================================

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
