-- कामगार — Row Level Security, grants, and execution privileges

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','worker_profiles','employer_profiles','skills','worker_skills',
    'worker_availability','jobs','applications','hires','attendance','payments','reviews','messages',
    'notifications','disputes','portfolio','activity_flags'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ------------------------------------------------------------------ skills
GRANT SELECT ON public.skills TO anon, authenticated;
DROP POLICY IF EXISTS skills_read ON public.skills;
CREATE POLICY skills_read ON public.skills FOR SELECT TO anon, authenticated USING (TRUE);

-- ---------------------------------------------------------------- profiles
-- phone is deliberately NOT granted: self reads it through get_my_profile()
GRANT SELECT (id, role, name, profile_photo, location, latitude, longitude, language,
              verification_status, created_at) ON public.profiles TO authenticated;
GRANT UPDATE (name, profile_photo, profile_photo_key, location, latitude, longitude, language)
      ON public.profiles TO authenticated;
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (COALESCE(is_suspended, FALSE) = FALSE OR id = (SELECT auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

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
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_protect_trg ON public.profiles;
CREATE TRIGGER profiles_protect_trg BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_protect();

-- --------------------------------------------------------- worker_profiles
GRANT SELECT ON public.worker_profiles TO authenticated;
GRANT UPDATE (experience, expected_daily_wage, work_radius, bio) ON public.worker_profiles TO authenticated;
DROP POLICY IF EXISTS worker_profiles_read ON public.worker_profiles;
CREATE POLICY worker_profiles_read ON public.worker_profiles FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS worker_profiles_update_own ON public.worker_profiles;
CREATE POLICY worker_profiles_update_own ON public.worker_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ------------------------------------------------------- employer_profiles
GRANT SELECT ON public.employer_profiles TO authenticated;
GRANT UPDATE (company_name, business_type, location, latitude, longitude) ON public.employer_profiles TO authenticated;
DROP POLICY IF EXISTS employer_profiles_read ON public.employer_profiles;
CREATE POLICY employer_profiles_read ON public.employer_profiles FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS employer_profiles_update_own ON public.employer_profiles;
CREATE POLICY employer_profiles_update_own ON public.employer_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------- worker_skills
GRANT SELECT, INSERT, DELETE ON public.worker_skills TO authenticated;
GRANT UPDATE (experience, is_primary) ON public.worker_skills TO authenticated;
DROP POLICY IF EXISTS worker_skills_read ON public.worker_skills;
CREATE POLICY worker_skills_read ON public.worker_skills FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS worker_skills_own ON public.worker_skills;
CREATE POLICY worker_skills_own ON public.worker_skills FOR INSERT TO authenticated
  WITH CHECK (worker_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS worker_skills_upd ON public.worker_skills;
CREATE POLICY worker_skills_upd ON public.worker_skills FOR UPDATE TO authenticated
  USING (worker_id = (SELECT auth.uid())) WITH CHECK (worker_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS worker_skills_del ON public.worker_skills;
CREATE POLICY worker_skills_del ON public.worker_skills FOR DELETE TO authenticated
  USING (worker_id = (SELECT auth.uid()));

-- ----------------------------------------------------- worker_availability
GRANT SELECT ON public.worker_availability TO authenticated;
GRANT UPDATE (status) ON public.worker_availability TO authenticated;
DROP POLICY IF EXISTS availability_read ON public.worker_availability;
CREATE POLICY availability_read ON public.worker_availability FOR SELECT TO authenticated
  USING (status = 'active' OR worker_id = (SELECT auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS availability_update_own ON public.worker_availability;
CREATE POLICY availability_update_own ON public.worker_availability FOR UPDATE TO authenticated
  USING (worker_id = (SELECT auth.uid())) WITH CHECK (worker_id = (SELECT auth.uid()));

-- -------------------------------------------------------------------- jobs
GRANT SELECT, INSERT ON public.jobs TO authenticated;
GRANT SELECT ON public.jobs TO anon;
GRANT UPDATE (title, description, workers_required, location, latitude, longitude, start_date,
              start_time, end_time, daily_wage, overtime_rate, duration, duration_days,
              food, transport, other_facilities, status, skill_id) ON public.jobs TO authenticated;
DROP POLICY IF EXISTS jobs_read ON public.jobs;
CREATE POLICY jobs_read ON public.jobs FOR SELECT TO anon, authenticated
  USING (status IN ('open','filled','in_progress','completed')
         OR employer_id = (SELECT auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS jobs_insert_own ON public.jobs;
CREATE POLICY jobs_insert_own ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (employer_id = (SELECT auth.uid()) AND public.current_role_name() = 'employer');
DROP POLICY IF EXISTS jobs_update_own ON public.jobs;
CREATE POLICY jobs_update_own ON public.jobs FOR UPDATE TO authenticated
  USING (employer_id = (SELECT auth.uid())) WITH CHECK (employer_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.jobs_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.employer_profiles SET jobs_posted = jobs_posted + 1 WHERE user_id = NEW.employer_id;
  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT DISTINCT wa.worker_id, 'new_nearby_work', 'नया काम आया 🔨',
         NEW.title || ' — ₹' || NEW.daily_wage || '/दिन, ' || NEW.location, '/worker/jobs'
    FROM public.worker_availability wa
   WHERE wa.status = 'active' AND wa.available_until > NOW()
     AND (wa.skill_id IS NULL OR NEW.skill_id IS NULL OR wa.skill_id = NEW.skill_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS jobs_after_insert_trg ON public.jobs;
CREATE TRIGGER jobs_after_insert_trg AFTER INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_after_insert();

-- ------------------------------------------------------------ applications
GRANT SELECT ON public.applications TO authenticated;
DROP POLICY IF EXISTS applications_read ON public.applications;
CREATE POLICY applications_read ON public.applications FOR SELECT TO authenticated
  USING (worker_id = (SELECT auth.uid()) OR employer_id = (SELECT auth.uid()) OR public.is_admin());

-- ------------------------------------------------------------------ hires
GRANT SELECT ON public.hires TO authenticated;
DROP POLICY IF EXISTS hires_read ON public.hires;
CREATE POLICY hires_read ON public.hires FOR SELECT TO authenticated
  USING (worker_id = (SELECT auth.uid()) OR employer_id = (SELECT auth.uid()) OR public.is_admin());

-- ------------------------------------------------------------- attendance
-- read-only to the two parties; ALL writes go through public.mark_attendance()
GRANT SELECT ON public.attendance TO authenticated;
DROP POLICY IF EXISTS attendance_read ON public.attendance;
CREATE POLICY attendance_read ON public.attendance FOR SELECT TO authenticated
  USING (worker_id = (SELECT auth.uid()) OR employer_id = (SELECT auth.uid()) OR public.is_admin());

-- --------------------------------------------------------------- payments
GRANT SELECT ON public.payments TO authenticated;
DROP POLICY IF EXISTS payments_read ON public.payments;
CREATE POLICY payments_read ON public.payments FOR SELECT TO authenticated
  USING (worker_id = (SELECT auth.uid()) OR employer_id = (SELECT auth.uid()) OR public.is_admin());

-- ---------------------------------------------------------------- reviews
GRANT SELECT ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
DROP POLICY IF EXISTS reviews_read ON public.reviews;
CREATE POLICY reviews_read ON public.reviews FOR SELECT TO anon, authenticated USING (TRUE);

-- --------------------------------------------------------------- messages
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
DROP POLICY IF EXISTS messages_read ON public.messages;
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS messages_send ON public.messages;
CREATE POLICY messages_send ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND public.shares_engagement(receiver_id));
DROP POLICY IF EXISTS messages_mark_read ON public.messages;
CREATE POLICY messages_mark_read ON public.messages FOR UPDATE TO authenticated
  USING (receiver_id = (SELECT auth.uid())) WITH CHECK (receiver_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.notify_user(NEW.receiver_id, 'message', 'नया संदेश 💬',
    (SELECT name FROM public.profiles WHERE id = NEW.sender_id) || ': ' || left(NEW.message, 60), '/chat');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS messages_after_trg ON public.messages;
CREATE TRIGGER messages_after_trg AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_after_insert();

-- ----------------------------------------------------------- notifications
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read_status) ON public.notifications TO authenticated;
DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS notifications_upd ON public.notifications;
CREATE POLICY notifications_upd ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS notifications_del ON public.notifications;
CREATE POLICY notifications_del ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- --------------------------------------------------------------- disputes
GRANT SELECT ON public.disputes TO authenticated;
DROP POLICY IF EXISTS disputes_read ON public.disputes;
CREATE POLICY disputes_read ON public.disputes FOR SELECT TO authenticated
  USING (raised_by = (SELECT auth.uid()) OR against_user = (SELECT auth.uid()) OR public.is_admin());

-- -------------------------------------------------------------- portfolio
GRANT SELECT, INSERT, DELETE ON public.portfolio TO authenticated;
GRANT UPDATE (title, description, is_public) ON public.portfolio TO authenticated;
DROP POLICY IF EXISTS portfolio_read ON public.portfolio;
CREATE POLICY portfolio_read ON public.portfolio FOR SELECT TO authenticated
  USING ((is_public AND kind <> 'identity') OR worker_id = (SELECT auth.uid()) OR public.is_admin());
DROP POLICY IF EXISTS portfolio_ins ON public.portfolio;
CREATE POLICY portfolio_ins ON public.portfolio FOR INSERT TO authenticated
  WITH CHECK (worker_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS portfolio_upd ON public.portfolio;
CREATE POLICY portfolio_upd ON public.portfolio FOR UPDATE TO authenticated
  USING (worker_id = (SELECT auth.uid())) WITH CHECK (worker_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS portfolio_del ON public.portfolio;
CREATE POLICY portfolio_del ON public.portfolio FOR DELETE TO authenticated
  USING (worker_id = (SELECT auth.uid()));

-- ---------------------------------------------------------- activity_flags
GRANT SELECT ON public.activity_flags TO authenticated;
DROP POLICY IF EXISTS flags_admin ON public.activity_flags;
CREATE POLICY flags_admin ON public.activity_flags FOR SELECT TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------ RPC EXECUTE
REVOKE ALL ON FUNCTION public.admin_stats(), public.admin_list(TEXT,INTEGER),
  public.admin_set_verification(UUID,TEXT), public.admin_resolve_dispute(UUID,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_available_workers(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distance_km(DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_profile(TEXT,TEXT,TEXT,TEXT,DOUBLE PRECISION,DOUBLE PRECISION,TEXT,TEXT,INTEGER,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_availability(UUID,TEXT,NUMERIC,TIMESTAMPTZ,TIMESTAMPTZ,NUMERIC,TEXT,TEXT,DOUBLE PRECISION,DOUBLE PRECISION,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_availability() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_availability() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_available_workers(UUID,NUMERIC,NUMERIC,INTEGER,DOUBLE PRECISION,DOUBLE PRECISION,NUMERIC,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_available_jobs(UUID,NUMERIC,DOUBLE PRECISION,DOUBLE PRECISION,NUMERIC,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_to_job(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_worker(UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_application_status(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_application(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_attendance(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(UUID,NUMERIC,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(UUID,NUMERIC,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.raise_dispute(TEXT,TEXT,UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_engagement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list(TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_verification(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(UUID,TEXT,TEXT) TO authenticated;
