-- =====================================================================
-- Fix for 20260905120300 (second part): the plpgsql record variable 'u'
-- collided with the table alias 'u' in the SELECT list — 'SELECT u.id'
-- was reading the (unassigned) variable, not the table. Rename the
-- alias to 'au'. (Applied to the live DB as version 20260905130001.)
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

  SELECT au.id, p.name, p.role INTO u
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.id
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
