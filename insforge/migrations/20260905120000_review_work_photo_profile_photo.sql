-- कामगार — रेटिंग में काम की फोटो + रजिस्ट्रेशन में लाइव प्रोफाइल फोटो
--
-- 1) reviews.work_photo : नियोक्ता कामगार को रेटिंग देते समय पूरे हुए काम की फोटो
--    जोड़ सकता है। सार्वजनिक URL (work_photos बकेट)।
-- 2) create_my_profile : अब रजिस्ट्रेशन पर कैमरे से ली गई लाइव फोटो भी लेता है
--    (profiles.profile_photo / profile_photo_key)।

-- ------------------------------------------------- reviews: work photo column
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS work_photo TEXT;

-- ------------------------------------------------- submit_review: photo param
CREATE OR REPLACE FUNCTION public.submit_review(
  p_hire_id UUID, p_rating NUMERIC, p_categories JSONB DEFAULT '{}'::jsonb,
  p_review TEXT DEFAULT NULL, p_work_photo TEXT DEFAULT NULL)
RETURNS public.reviews LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); h RECORD; row public.reviews; other UUID; rrole TEXT;
BEGIN
  SELECT * INTO h FROM public.hires WHERE id = p_hire_id;
  IF h IS NULL THEN RAISE EXCEPTION 'काम नहीं मिला'; END IF;
  IF uid NOT IN (h.worker_id, h.employer_id) THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  other := CASE WHEN uid = h.worker_id THEN h.employer_id ELSE h.worker_id END;
  rrole := CASE WHEN uid = h.worker_id THEN 'worker' ELSE 'employer' END;

  INSERT INTO public.reviews (job_id, hire_id, reviewer_id, reviewed_user_id, reviewer_role,
                              rating, categories, review, work_photo)
  VALUES (h.job_id, p_hire_id, uid, other, rrole, p_rating, COALESCE(p_categories,'{}'::jsonb), p_review,
          -- only the employer (the one whose worker did the work) may attach a work photo
          CASE WHEN rrole = 'employer' THEN NULLIF(TRIM(p_work_photo), '') END)
  ON CONFLICT (hire_id, reviewer_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    categories = EXCLUDED.categories,
    review = EXCLUDED.review,
    work_photo = EXCLUDED.work_photo
  RETURNING * INTO row;
  RETURN row;
END $$;

-- ------------------------------------------- create_my_profile: live photo param
-- (NOTE: the applied version of this migration contained the pre-mobile-auth body
--  without phone derivation — corrected by migration 20260905120200, which is the
--  authoritative merged body. This file's create_my_profile matches that body.)
CREATE OR REPLACE FUNCTION public.create_my_profile(
  p_role TEXT, p_name TEXT, p_phone TEXT DEFAULT NULL, p_location TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL, p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL, p_business_type TEXT DEFAULT NULL,
  p_experience INTEGER DEFAULT 0, p_expected_wage NUMERIC DEFAULT 0,
  p_profile_photo TEXT DEFAULT NULL, p_profile_photo_key TEXT DEFAULT NULL
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

  INSERT INTO public.profiles (id, role, name, phone, email, location, latitude, longitude,
                               profile_photo, profile_photo_key)
  VALUES (uid, p_role, p_name, final_phone, em, p_location,
          ROUND(p_latitude::numeric, 3)::double precision,
          ROUND(p_longitude::numeric, 3)::double precision,
          NULLIF(TRIM(p_profile_photo), ''), NULLIF(TRIM(p_profile_photo_key), ''))
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    location = COALESCE(EXCLUDED.location, public.profiles.location),
    latitude = COALESCE(EXCLUDED.latitude, public.profiles.latitude),
    longitude = COALESCE(EXCLUDED.longitude, public.profiles.longitude),
    profile_photo = COALESCE(EXCLUDED.profile_photo, public.profiles.profile_photo),
    profile_photo_key = COALESCE(EXCLUDED.profile_photo_key, public.profiles.profile_photo_key);

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
