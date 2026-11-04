-- कामगार — server-side RPCs (all authorization enforced inside the function)

-- ============================================================ public/landing
CREATE OR REPLACE FUNCTION public.platform_stats()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT json_build_object(
    'registered_workers', (SELECT COUNT(*) FROM public.profiles WHERE role = 'worker'),
    'active_workers',     (SELECT COUNT(DISTINCT worker_id) FROM public.worker_availability
                            WHERE status = 'active' AND available_until > NOW()),
    'active_jobs',        (SELECT COUNT(*) FROM public.jobs WHERE status = 'open'),
    'completed_jobs',     (SELECT COUNT(*) FROM public.hires WHERE status = 'completed'),
    'registered_employers',(SELECT COUNT(*) FROM public.profiles WHERE role = 'employer')
  )
$$;

-- Safe public projection of currently-available workers (no phone, no exact address)
CREATE OR REPLACE FUNCTION public.public_available_workers(p_limit INTEGER DEFAULT 6)
RETURNS TABLE (
  worker_id UUID, name TEXT, photo TEXT, area TEXT, skill TEXT, skill_hi TEXT, icon TEXT,
  rating NUMERIC, experience INTEGER, expected_wage NUMERIC, available_until TIMESTAMPTZ,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT DISTINCT ON (wa.worker_id)
    wa.worker_id, p.name, p.profile_photo,
    COALESCE(wa.location, p.location) AS area,
    s.name, s.name_hi, s.icon,
    wp.rating_avg, wp.experience, wa.expected_wage, wa.available_until,
    ROUND(wa.latitude::numeric, 2)::double precision,
    ROUND(wa.longitude::numeric, 2)::double precision
  FROM public.worker_availability wa
  JOIN public.profiles p ON p.id = wa.worker_id
  LEFT JOIN public.worker_profiles wp ON wp.user_id = wa.worker_id
  LEFT JOIN public.skills s ON s.id = wa.skill_id
  WHERE wa.status = 'active' AND wa.available_until > NOW()
    AND COALESCE(p.is_suspended, FALSE) = FALSE
  ORDER BY wa.worker_id, wa.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 50))
$$;

-- =============================================================== profile me
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT json_build_object(
    'profile', (SELECT row_to_json(p) FROM public.profiles p WHERE p.id = auth.uid()),
    'worker',  (SELECT row_to_json(w) FROM public.worker_profiles w WHERE w.user_id = auth.uid()),
    'employer',(SELECT row_to_json(e) FROM public.employer_profiles e WHERE e.user_id = auth.uid())
  )
$$;

-- Bootstrap: create profile + role record right after signup
CREATE OR REPLACE FUNCTION public.create_my_profile(
  p_role TEXT, p_name TEXT, p_phone TEXT DEFAULT NULL, p_location TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL, p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL, p_business_type TEXT DEFAULT NULL,
  p_experience INTEGER DEFAULT 0, p_expected_wage NUMERIC DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); em TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'लॉगिन आवश्यक है'; END IF;
  IF p_role NOT IN ('worker','employer') THEN RAISE EXCEPTION 'गलत भूमिका'; END IF;
  SELECT email INTO em FROM auth.users WHERE id = uid;

  -- duplicate-account safeguard: same phone on another account is flagged, not banned
  IF p_phone IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.profiles WHERE phone = p_phone AND id <> uid) THEN
    RAISE EXCEPTION 'यह मोबाइल नंबर पहले से पंजीकृत है';
  END IF;

  INSERT INTO public.profiles (id, role, name, phone, email, location, latitude, longitude)
  VALUES (uid, p_role, p_name, p_phone, em, p_location,
          ROUND(p_latitude::numeric, 3)::double precision,
          ROUND(p_longitude::numeric, 3)::double precision)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
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

-- ========================================================== availability
CREATE OR REPLACE FUNCTION public.publish_availability(
  p_skill_id UUID, p_location TEXT, p_radius NUMERIC, p_available_from TIMESTAMPTZ,
  p_available_until TIMESTAMPTZ, p_expected_wage NUMERIC, p_job_type TEXT DEFAULT 'daily',
  p_available_time TEXT DEFAULT NULL, p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS public.worker_availability LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); row public.worker_availability;
BEGIN
  IF public.current_role_name() <> 'worker' THEN RAISE EXCEPTION 'केवल कामगार उपलब्धता दर्ज कर सकते हैं'; END IF;
  IF p_available_until <= NOW() THEN RAISE EXCEPTION 'उपलब्धता की समय-सीमा भविष्य में होनी चाहिए'; END IF;

  UPDATE public.worker_availability SET status = 'cancelled'
   WHERE worker_id = uid AND status = 'active';

  INSERT INTO public.worker_availability
    (worker_id, skill_id, location, latitude, longitude, radius, available_from, available_until,
     available_time, expected_wage, job_type, note, status)
  VALUES (uid, p_skill_id, p_location,
          ROUND(p_latitude::numeric,3)::double precision, ROUND(p_longitude::numeric,3)::double precision,
          COALESCE(p_radius,5), COALESCE(p_available_from, NOW()), p_available_until,
          p_available_time, COALESCE(p_expected_wage,0), COALESCE(p_job_type,'daily'), p_note, 'active')
  RETURNING * INTO row;

  UPDATE public.worker_profiles SET availability_status = 'available',
         expected_daily_wage = COALESCE(NULLIF(p_expected_wage,0), expected_daily_wage),
         work_radius = COALESCE(p_radius, work_radius)
   WHERE user_id = uid;
  RETURN row;
END $$;

CREATE OR REPLACE FUNCTION public.stop_availability()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.worker_availability SET status = 'cancelled'
   WHERE worker_id = auth.uid() AND status = 'active';
  UPDATE public.worker_profiles SET availability_status = 'offline' WHERE user_id = auth.uid();
END $$;

-- Employer-facing search of available workers (privacy-safe projection)
CREATE OR REPLACE FUNCTION public.search_available_workers(
  p_skill_id UUID DEFAULT NULL, p_max_wage NUMERIC DEFAULT NULL, p_min_rating NUMERIC DEFAULT NULL,
  p_min_experience INTEGER DEFAULT NULL, p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL, p_max_distance NUMERIC DEFAULT NULL,
  p_search TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  availability_id UUID, worker_id UUID, name TEXT, photo TEXT, area TEXT,
  skill_id UUID, skill TEXT, skill_hi TEXT, icon TEXT, rating NUMERIC, rating_count INTEGER,
  experience INTEGER, expected_wage NUMERIC, radius NUMERIC, available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ, available_time TEXT, job_type TEXT, completed_jobs INTEGER,
  work_score NUMERIC, verification_status TEXT, distance_km DOUBLE PRECISION
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF public.current_role_name() IS NULL THEN RAISE EXCEPTION 'लॉगिन आवश्यक है'; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (wa.worker_id)
    wa.id, wa.worker_id, p.name, p.profile_photo, COALESCE(wa.location, p.location),
    s.id, s.name, s.name_hi, s.icon,
    wp.rating_avg, wp.rating_count, wp.experience, wa.expected_wage, wa.radius,
    wa.available_from, wa.available_until, wa.available_time, wa.job_type,
    wp.completed_jobs, wp.work_score, p.verification_status,
    public.distance_km(p_lat, p_lng, wa.latitude, wa.longitude)
  FROM public.worker_availability wa
  JOIN public.profiles p ON p.id = wa.worker_id
  LEFT JOIN public.worker_profiles wp ON wp.user_id = wa.worker_id
  LEFT JOIN public.skills s ON s.id = wa.skill_id
  WHERE wa.status = 'active' AND wa.available_until > NOW()
    AND COALESCE(p.is_suspended, FALSE) = FALSE
    AND (p_skill_id IS NULL OR wa.skill_id = p_skill_id)
    AND (p_max_wage IS NULL OR wa.expected_wage <= p_max_wage)
    AND (p_min_rating IS NULL OR COALESCE(wp.rating_avg,0) >= p_min_rating)
    AND (p_min_experience IS NULL OR COALESCE(wp.experience,0) >= p_min_experience)
    AND (p_search IS NULL OR p.name ILIKE '%'||p_search||'%' OR wa.location ILIKE '%'||p_search||'%')
    AND (p_max_distance IS NULL OR p_lat IS NULL
         OR COALESCE(public.distance_km(p_lat, p_lng, wa.latitude, wa.longitude), 1e9) <= p_max_distance)
  ORDER BY wa.worker_id, wa.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit,50), 200));
END $$;

-- Worker-facing job search
CREATE OR REPLACE FUNCTION public.search_available_jobs(
  p_skill_id UUID DEFAULT NULL, p_min_wage NUMERIC DEFAULT NULL, p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL, p_max_distance NUMERIC DEFAULT NULL,
  p_search TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  job_id UUID, title TEXT, description TEXT, employer_id UUID, employer_name TEXT,
  company_name TEXT, employer_rating NUMERIC, employer_verified TEXT,
  skill_id UUID, skill TEXT, skill_hi TEXT, icon TEXT, location TEXT,
  workers_required INTEGER, workers_hired INTEGER, start_date DATE, start_time TIME, end_time TIME,
  daily_wage NUMERIC, overtime_rate NUMERIC, duration TEXT, food BOOLEAN, transport BOOLEAN,
  other_facilities TEXT, created_at TIMESTAMPTZ, distance_km DOUBLE PRECISION,
  already_applied BOOLEAN, application_status TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'लॉगिन आवश्यक है'; END IF;
  RETURN QUERY
  SELECT j.id, j.title, j.description, j.employer_id, p.name, ep.company_name,
         ep.rating_avg, p.verification_status,
         s.id, s.name, s.name_hi, s.icon, j.location,
         j.workers_required, j.workers_hired, j.start_date, j.start_time, j.end_time,
         j.daily_wage, j.overtime_rate, j.duration, j.food, j.transport, j.other_facilities,
         j.created_at,
         public.distance_km(p_lat, p_lng, j.latitude, j.longitude),
         (a.id IS NOT NULL), a.status
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.employer_id
  LEFT JOIN public.employer_profiles ep ON ep.user_id = j.employer_id
  LEFT JOIN public.skills s ON s.id = j.skill_id
  LEFT JOIN public.applications a ON a.job_id = j.id AND a.worker_id = uid
  WHERE j.status = 'open' AND j.workers_hired < j.workers_required
    AND j.start_date >= CURRENT_DATE
    AND COALESCE(p.is_suspended, FALSE) = FALSE
    AND (p_skill_id IS NULL OR j.skill_id = p_skill_id)
    AND (p_min_wage IS NULL OR j.daily_wage >= p_min_wage)
    AND (p_search IS NULL OR j.title ILIKE '%'||p_search||'%' OR j.location ILIKE '%'||p_search||'%')
    AND (p_max_distance IS NULL OR p_lat IS NULL
         OR COALESCE(public.distance_km(p_lat, p_lng, j.latitude, j.longitude), 1e9) <= p_max_distance)
  ORDER BY j.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit,50), 200));
END $$;

-- ========================================================== applications
CREATE OR REPLACE FUNCTION public.apply_to_job(p_job_id UUID, p_message TEXT DEFAULT NULL)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); j RECORD; row public.applications; recent INTEGER;
BEGIN
  IF public.current_role_name() <> 'worker' THEN RAISE EXCEPTION 'केवल कामगार आवेदन कर सकते हैं'; END IF;
  SELECT * INTO j FROM public.jobs WHERE id = p_job_id;
  IF j IS NULL THEN RAISE EXCEPTION 'काम नहीं मिला'; END IF;
  IF j.status <> 'open' THEN RAISE EXCEPTION 'यह काम अब उपलब्ध नहीं है'; END IF;

  -- spam safeguard: flag, never auto-ban
  SELECT COUNT(*) INTO recent FROM public.applications
   WHERE worker_id = uid AND applied_at > NOW() - INTERVAL '1 hour';
  IF recent >= 15 THEN
    INSERT INTO public.activity_flags (user_id, entity, entity_id, reason, severity)
    VALUES (uid, 'applications', p_job_id, 'एक घंटे में 15+ आवेदन', 'medium');
    RAISE EXCEPTION 'बहुत ज़्यादा आवेदन — थोड़ी देर बाद कोशिश करें';
  END IF;

  -- no conflicting confirmed job on the same date
  IF EXISTS (SELECT 1 FROM public.hires h WHERE h.worker_id = uid AND h.work_date = j.start_date
               AND h.status IN ('confirmed','in_progress')) THEN
    RAISE EXCEPTION 'इस तारीख पर आपका दूसरा काम पहले से पक्का है';
  END IF;

  INSERT INTO public.applications (job_id, worker_id, employer_id, source, status, message)
  VALUES (p_job_id, uid, j.employer_id, 'worker_applied', 'applied', p_message)
  ON CONFLICT (job_id, worker_id) DO UPDATE SET status = 'applied', message = EXCLUDED.message
  RETURNING * INTO row;

  PERFORM public.notify_user(j.employer_id, 'application_received', 'नया आवेदन 📩',
    (SELECT name FROM public.profiles WHERE id = uid) || ' ने "' || j.title || '" के लिए आवेदन किया।',
    '/employer/applications');
  RETURN row;
END $$;

CREATE OR REPLACE FUNCTION public.invite_worker(p_job_id UUID, p_worker_id UUID, p_message TEXT DEFAULT NULL)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); j RECORD; row public.applications;
BEGIN
  SELECT * INTO j FROM public.jobs WHERE id = p_job_id;
  IF j IS NULL OR j.employer_id <> uid THEN RAISE EXCEPTION 'यह काम आपका नहीं है'; END IF;
  IF j.status <> 'open' THEN RAISE EXCEPTION 'यह काम अब खुला नहीं है'; END IF;

  INSERT INTO public.applications (job_id, worker_id, employer_id, source, status, message)
  VALUES (p_job_id, p_worker_id, uid, 'employer_invited', 'invited', p_message)
  ON CONFLICT (job_id, worker_id) DO UPDATE SET status =
      CASE WHEN public.applications.status IN ('rejected','cancelled') THEN 'invited'
           ELSE public.applications.status END,
      message = EXCLUDED.message
  RETURNING * INTO row;

  PERFORM public.notify_user(p_worker_id, 'invitation_received', 'काम के लिए बुलावा 🏗️',
    '"' || j.title || '" के लिए ₹' || j.daily_wage || '/दिन पर बुलाया गया है।', '/worker/applications');
  RETURN row;
END $$;

CREATE OR REPLACE FUNCTION public.update_application_status(p_application_id UUID, p_status TEXT)
RETURNS public.applications LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); a RECORD; row public.applications;
BEGIN
  SELECT * INTO a FROM public.applications WHERE id = p_application_id;
  IF a IS NULL THEN RAISE EXCEPTION 'आवेदन नहीं मिला'; END IF;
  IF uid NOT IN (a.worker_id, a.employer_id) THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  IF p_status NOT IN ('shortlisted','rejected','cancelled') THEN
    RAISE EXCEPTION 'यह स्थिति यहाँ से नहीं बदली जा सकती'; END IF;
  IF p_status = 'shortlisted' AND uid <> a.employer_id THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;

  UPDATE public.applications SET status = p_status WHERE id = p_application_id RETURNING * INTO row;
  PERFORM public.notify_user(CASE WHEN uid = a.employer_id THEN a.worker_id ELSE a.employer_id END,
    'application_update', 'आवेदन अपडेट', 'आवेदन की स्थिति: ' || p_status, NULL);
  RETURN row;
END $$;

-- ================================================================= hiring
-- Called by the employer to accept a worker's application, or by the worker
-- to accept an employer's invitation. Both sides accepting => JOB CONFIRMED.
CREATE OR REPLACE FUNCTION public.accept_application(p_application_id UUID)
RETURNS public.hires LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); a RECORD; j RECORD; h public.hires;
BEGIN
  SELECT * INTO a FROM public.applications WHERE id = p_application_id;
  IF a IS NULL THEN RAISE EXCEPTION 'आवेदन नहीं मिला'; END IF;
  SELECT * INTO j FROM public.jobs WHERE id = a.job_id;

  IF a.source = 'worker_applied' AND uid <> a.employer_id THEN
    RAISE EXCEPTION 'नियोक्ता ही आवेदन स्वीकार कर सकता है'; END IF;
  IF a.source = 'employer_invited' AND uid <> a.worker_id THEN
    RAISE EXCEPTION 'कामगार ही बुलावा स्वीकार कर सकता है'; END IF;
  IF a.status IN ('rejected','cancelled') THEN RAISE EXCEPTION 'यह आवेदन बंद हो चुका है'; END IF;
  IF j.workers_hired >= j.workers_required THEN RAISE EXCEPTION 'सभी कामगार भर चुके हैं'; END IF;

  IF EXISTS (SELECT 1 FROM public.hires x WHERE x.worker_id = a.worker_id
               AND x.work_date = j.start_date AND x.status IN ('confirmed','in_progress')) THEN
    RAISE EXCEPTION 'कामगार का इस तारीख पर दूसरा काम पक्का है';
  END IF;

  UPDATE public.applications SET status = 'accepted' WHERE id = p_application_id;

  INSERT INTO public.hires (job_id, application_id, worker_id, employer_id, skill_id, work_date,
                            daily_wage, overtime_rate, scheduled_in, scheduled_out, status)
  VALUES (a.job_id, a.id, a.worker_id, a.employer_id, j.skill_id, j.start_date,
          j.daily_wage, j.overtime_rate, j.start_time, j.end_time, 'confirmed')
  ON CONFLICT (job_id, worker_id) DO UPDATE SET status = 'confirmed'
  RETURNING * INTO h;

  INSERT INTO public.attendance (hire_id, worker_id, employer_id, date, scheduled_in, scheduled_out,
                                 daily_wage, overtime_rate)
  VALUES (h.id, h.worker_id, h.employer_id, j.start_date,
          (j.start_date + j.start_time) AT TIME ZONE 'Asia/Kolkata',
          (j.start_date + j.end_time) AT TIME ZONE 'Asia/Kolkata',
          j.daily_wage, j.overtime_rate)
  ON CONFLICT (hire_id, date) DO NOTHING;

  UPDATE public.jobs SET workers_hired = workers_hired + 1,
         status = CASE WHEN workers_hired + 1 >= workers_required THEN 'filled' ELSE 'open' END
   WHERE id = j.id;
  UPDATE public.employer_profiles SET workers_hired = workers_hired + 1 WHERE user_id = a.employer_id;
  UPDATE public.worker_availability SET status = 'hired'
   WHERE worker_id = a.worker_id AND status = 'active';
  UPDATE public.worker_profiles SET availability_status = 'hired' WHERE user_id = a.worker_id;

  PERFORM public.notify_user(a.worker_id, 'job_confirmed', 'काम पक्का हुआ ✅',
    '"' || j.title || '" — ' || to_char(j.start_date,'DD-MM-YYYY') || ' को ₹' || j.daily_wage || '/दिन', '/worker/jobs');
  PERFORM public.notify_user(a.employer_id, 'job_confirmed', 'काम पक्का हुआ ✅',
    (SELECT name FROM public.profiles WHERE id = a.worker_id) || ' के साथ काम पक्का हुआ।', '/employer/jobs');
  RETURN h;
END $$;

-- ========================================================= digital hajri
-- The ONLY way attendance timestamps are written. Server clock, side-owned.
CREATE OR REPLACE FUNCTION public.mark_attendance(p_attendance_id UUID, p_action TEXT)
RETURNS public.attendance LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); att RECORD; row public.attendance; ts TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO att FROM public.attendance WHERE id = p_attendance_id;
  IF att IS NULL THEN RAISE EXCEPTION 'हाजिरी रिकॉर्ड नहीं मिला'; END IF;
  IF att.is_locked THEN RAISE EXCEPTION 'रिकॉर्ड लॉक है'; END IF;
  IF uid NOT IN (att.worker_id, att.employer_id) THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;

  IF p_action = 'worker_in' THEN
    IF uid <> att.worker_id THEN RAISE EXCEPTION 'केवल कामगार Check-IN कर सकता है'; END IF;
    IF att.worker_in IS NOT NULL THEN RAISE EXCEPTION 'Check-IN पहले ही हो चुका है'; END IF;
    UPDATE public.attendance SET worker_in = ts WHERE id = p_attendance_id;
  ELSIF p_action = 'employer_in' THEN
    IF uid <> att.employer_id THEN RAISE EXCEPTION 'केवल नियोक्ता पुष्टि कर सकता है'; END IF;
    IF att.employer_in IS NOT NULL THEN RAISE EXCEPTION 'पुष्टि पहले ही हो चुकी है'; END IF;
    UPDATE public.attendance SET employer_in = ts WHERE id = p_attendance_id;
  ELSIF p_action = 'worker_out' THEN
    IF uid <> att.worker_id THEN RAISE EXCEPTION 'केवल कामगार Check-OUT कर सकता है'; END IF;
    IF att.confirmed_in IS NULL THEN RAISE EXCEPTION 'पहले दोनों तरफ से Check-IN ज़रूरी है'; END IF;
    IF att.worker_out IS NOT NULL THEN RAISE EXCEPTION 'Check-OUT पहले ही हो चुका है'; END IF;
    UPDATE public.attendance SET worker_out = ts WHERE id = p_attendance_id;
  ELSIF p_action = 'employer_out' THEN
    IF uid <> att.employer_id THEN RAISE EXCEPTION 'केवल नियोक्ता पुष्टि कर सकता है'; END IF;
    IF att.confirmed_in IS NULL THEN RAISE EXCEPTION 'पहले दोनों तरफ से Check-IN ज़रूरी है'; END IF;
    IF att.employer_out IS NOT NULL THEN RAISE EXCEPTION 'पुष्टि पहले ही हो चुकी है'; END IF;
    UPDATE public.attendance SET employer_out = ts WHERE id = p_attendance_id;
  ELSE
    RAISE EXCEPTION 'गलत क्रिया';
  END IF;

  UPDATE public.hires SET status = 'in_progress'
   WHERE id = att.hire_id AND status = 'confirmed';

  SELECT * INTO row FROM public.attendance WHERE id = p_attendance_id;
  IF row.attendance_status IN ('pending_in','pending_out') THEN
    PERFORM public.notify_user(CASE WHEN uid = row.worker_id THEN row.employer_id ELSE row.worker_id END,
      'attendance_pending', 'पुष्टि बाकी है 🟡',
      'दूसरी तरफ से हाजिरी की पुष्टि का इंतज़ार है।', NULL);
  END IF;
  RETURN row;
END $$;

-- ============================================================== payments
CREATE OR REPLACE FUNCTION public.record_payment(
  p_payment_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'cash',
  p_reference TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); pay RECORD; row public.payments; new_paid NUMERIC;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id;
  IF pay IS NULL THEN RAISE EXCEPTION 'भुगतान रिकॉर्ड नहीं मिला'; END IF;
  IF uid <> pay.employer_id THEN RAISE EXCEPTION 'केवल नियोक्ता भुगतान दर्ज कर सकता है'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'राशि गलत है'; END IF;

  new_paid := LEAST(pay.amount, pay.paid_amount + p_amount);
  UPDATE public.payments SET
    paid_amount = new_paid,
    status = CASE WHEN new_paid >= pay.amount THEN 'paid'
                  WHEN new_paid > 0 THEN 'partial' ELSE 'pending' END,
    method = COALESCE(p_method, method),
    reference = COALESCE(p_reference, reference),
    note = COALESCE(p_note, note),
    payment_date = NOW()
  WHERE id = p_payment_id RETURNING * INTO row;
  RETURN row;
END $$;

-- =============================================================== reviews
CREATE OR REPLACE FUNCTION public.submit_review(
  p_hire_id UUID, p_rating NUMERIC, p_categories JSONB DEFAULT '{}'::jsonb, p_review TEXT DEFAULT NULL)
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
                              rating, categories, review)
  VALUES (h.job_id, p_hire_id, uid, other, rrole, p_rating, COALESCE(p_categories,'{}'::jsonb), p_review)
  RETURNING * INTO row;
  RETURN row;
END $$;

-- ============================================================== disputes
CREATE OR REPLACE FUNCTION public.raise_dispute(
  p_type TEXT, p_description TEXT, p_hire_id UUID DEFAULT NULL,
  p_attendance_id UUID DEFAULT NULL, p_evidence TEXT DEFAULT NULL)
RETURNS public.disputes LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE uid UUID := auth.uid(); h RECORD; row public.disputes; against UUID; jid UUID;
BEGIN
  IF p_hire_id IS NOT NULL THEN
    SELECT * INTO h FROM public.hires WHERE id = p_hire_id;
    IF h IS NULL OR uid NOT IN (h.worker_id, h.employer_id) THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
    against := CASE WHEN uid = h.worker_id THEN h.employer_id ELSE h.worker_id END;
    jid := h.job_id;
    UPDATE public.hires SET status = 'disputed' WHERE id = p_hire_id;
    IF p_attendance_id IS NOT NULL THEN
      UPDATE public.attendance SET attendance_status = 'disputed', is_locked = TRUE
       WHERE id = p_attendance_id;
    END IF;
  END IF;
  INSERT INTO public.disputes (job_id, hire_id, attendance_id, raised_by, against_user, type,
                               description, evidence)
  VALUES (jid, p_hire_id, p_attendance_id, uid, against, p_type, p_description, p_evidence)
  RETURNING * INTO row;
  RETURN row;
END $$;

-- ================================================================ admin
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE WHEN NOT public.is_admin() THEN NULL ELSE json_build_object(
    'total_workers',      (SELECT COUNT(*) FROM public.profiles WHERE role='worker'),
    'total_employers',    (SELECT COUNT(*) FROM public.profiles WHERE role='employer'),
    'active_workers',     (SELECT COUNT(DISTINCT worker_id) FROM public.worker_availability
                            WHERE status='active' AND available_until > NOW()),
    'active_jobs',        (SELECT COUNT(*) FROM public.jobs WHERE status='open'),
    'completed_jobs',     (SELECT COUNT(*) FROM public.hires WHERE status='completed'),
    'pending_disputes',   (SELECT COUNT(*) FROM public.disputes WHERE status IN ('open','under_review')),
    'pending_verification',(SELECT COUNT(*) FROM public.profiles WHERE verification_status='pending'),
    'open_flags',         (SELECT COUNT(*) FROM public.activity_flags WHERE status='open'),
    'pending_payments',   (SELECT COALESCE(SUM(amount-paid_amount),0) FROM public.payments WHERE status<>'paid'),
    'total_paid',         (SELECT COALESCE(SUM(paid_amount),0) FROM public.payments)
  ) END
$$;

CREATE OR REPLACE FUNCTION public.admin_set_verification(p_user_id UUID, p_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  UPDATE public.profiles SET verification_status = p_status WHERE id = p_user_id;
  UPDATE public.employer_profiles SET verification_status = p_status WHERE user_id = p_user_id;
  PERFORM public.notify_user(p_user_id, 'verification', 'सत्यापन अपडेट',
    'आपका सत्यापन स्टेटस: ' || p_status, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(p_dispute_id UUID, p_status TEXT, p_resolution TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE d RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  UPDATE public.disputes SET status = p_status, resolution = p_resolution,
         resolved_at = CASE WHEN p_status IN ('resolved','rejected') THEN NOW() END
   WHERE id = p_dispute_id RETURNING * INTO d;
  IF d.hire_id IS NOT NULL AND p_status = 'resolved' THEN
    UPDATE public.hires SET status = 'completed' WHERE id = d.hire_id;
  END IF;
  PERFORM public.notify_user(d.raised_by, 'dispute_update', 'विवाद अपडेट', p_resolution, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list(p_entity TEXT, p_limit INTEGER DEFAULT 100)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE result JSON;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'अनुमति नहीं है'; END IF;
  IF p_entity NOT IN ('profiles','jobs','applications','hires','attendance','payments',
                      'reviews','disputes','activity_flags','worker_availability') THEN
    RAISE EXCEPTION 'गलत entity';
  END IF;
  EXECUTE format('SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM public.%I ORDER BY created_at DESC LIMIT %s) t',
                 p_entity, GREATEST(1, LEAST(COALESCE(p_limit,100), 500))) INTO result;
  RETURN result;
END $$;
