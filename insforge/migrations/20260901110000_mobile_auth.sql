-- कामगार — मोबाइल नंबर से लॉगिन
--
-- Auth identities are created against an internal alias address
-- (91XXXXXXXXXX@mobile.kaamgaar.app). The mobile number is the real credential, so the
-- profile's phone must be derived from the signed-in identity rather than trusted from
-- the client: otherwise a user could log in with one number and claim another.

CREATE OR REPLACE FUNCTION public.mobile_from_alias(em TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN em IS NULL THEN NULL
    WHEN em !~ '@mobile\.kaamgaar\.app$' THEN NULL
    ELSE regexp_replace(split_part(em, '@', 1), '^91', '')
  END
$$;

CREATE OR REPLACE FUNCTION public.create_my_profile(
  p_role TEXT, p_name TEXT, p_phone TEXT DEFAULT NULL, p_location TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL, p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL, p_business_type TEXT DEFAULT NULL,
  p_experience INTEGER DEFAULT 0, p_expected_wage NUMERIC DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); em TEXT; derived TEXT; final_phone TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'लॉगिन आवश्यक है'; END IF;
  IF p_role NOT IN ('worker','employer') THEN RAISE EXCEPTION 'गलत भूमिका'; END IF;

  SELECT email INTO em FROM auth.users WHERE id = uid;
  derived := public.mobile_from_alias(em);
  -- a mobile-registered account always uses its login number; email accounts may supply one
  final_phone := COALESCE(derived, NULLIF(regexp_replace(COALESCE(p_phone,''), '\D', '', 'g'), ''));

  IF final_phone IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.profiles WHERE phone = final_phone AND id <> uid) THEN
    RAISE EXCEPTION 'यह मोबाइल नंबर पहले से पंजीकृत है';
  END IF;

  INSERT INTO public.profiles (id, role, name, phone, email, location, latitude, longitude)
  VALUES (uid, p_role, p_name, final_phone, em, p_location,
          ROUND(p_latitude::numeric, 3)::double precision,
          ROUND(p_longitude::numeric, 3)::double precision)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    location = COALESCE(EXCLUDED.location, public.profiles.location),
    latitude = COALESCE(EXCLUDED.latitude, public.profiles.latitude),
    longitude = COALESCE(EXCLUDED.longitude, public.profiles.longitude);

  IF p_role = 'worker' THEN
    INSERT INTO public.worker_profiles (user_id, experience, expected_daily_wage)
    VALUES (uid, COALESCE(p_experience,0), COALESCE(p_expected_wage,0))
    ON CONFLICT (user_id) DO UPDATE SET experience = EXCLUDED.experience,
      expected_daily_wage = EXCLUDED.expected_daily_wage;
  ELSE
    INSERT INTO public.employer_profiles (user_id, company_name, business_type, location, latitude, longitude)
    VALUES (uid, p_company_name, p_business_type, p_location,
            ROUND(p_latitude::numeric, 3)::double precision,
            ROUND(p_longitude::numeric, 3)::double precision)
    ON CONFLICT (user_id) DO UPDATE SET company_name = EXCLUDED.company_name,
      business_type = EXCLUDED.business_type, location = EXCLUDED.location;
  END IF;
  RETURN public.get_my_profile();
END $$;

-- The mobile number is set from the verified login identity and must not be edited freely.
CREATE OR REPLACE FUNCTION public.profiles_protect()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'project_admin' THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.is_flagged IS DISTINCT FROM OLD.is_flagged
     OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    RAISE EXCEPTION 'यह जानकारी केवल एडमिन बदल सकता है';
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'मोबाइल नंबर लॉगिन से जुड़ा है — इसे बदला नहीं जा सकता';
  END IF;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION public.mobile_from_alias(TEXT) TO authenticated;
