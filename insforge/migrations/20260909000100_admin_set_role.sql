-- =====================================================================
-- Admin self-serve role management: change a user's role by mobile
-- number (promote to admin / demote back). No SQL/CLI needed — the
-- admin panel calls this RPC. Admin-only (checked inside, same pattern
-- as the other admin_* functions). The profiles_protect trigger allows
-- role changes when current_user is project_admin (this function runs
-- as the migration owner = project_admin).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_mobile_raw TEXT, p_new_role TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mobile TEXT;
  p      RECORD;
  nadmin INT;
  caller_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  mobile := NULLIF(regexp_replace(COALESCE(p_mobile_raw, ''), '\D', '', 'g'), '');
  IF length(mobile) <> 10 THEN
    RAISE EXCEPTION 'कृपया सही 10 अंकों का मोबाइल नंबर लिखें';
  END IF;
  IF p_new_role IS NULL OR p_new_role NOT IN ('worker', 'employer', 'admin') THEN
    RAISE EXCEPTION 'Role सिर्फ़ worker / employer / admin हो सकती है';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE phone = mobile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'यह मोबाइल नंबर हमारे रिकॉर्ड में नहीं मिला';
  END IF;

  -- safety: the last remaining admin cannot remove their own admin role
  IF p_new_role <> 'admin' THEN
    SELECT count(*) INTO nadmin FROM public.profiles WHERE role = 'admin';
    SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
    IF nadmin <= 1 AND caller_role = 'admin' AND p.id = auth.uid() THEN
      RAISE EXCEPTION 'अकेला एडमिन खुद को एडमिन से हटा नहीं सकता';
    END IF;
  END IF;

  UPDATE public.profiles
     SET role = p_new_role,
         verification_status = CASE WHEN p_new_role = 'admin' THEN 'verified' ELSE verification_status END
   WHERE id = p.id;

  RETURN json_build_object('name', p.name, 'mobile', mobile,
                           'previous_role', p.role, 'new_role', p_new_role);
END $$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(TEXT, TEXT) TO authenticated;
