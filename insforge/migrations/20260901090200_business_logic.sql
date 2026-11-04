-- कामगार — helper functions, business rules, triggers

-- ------------------------------------------------------------- utilities
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','worker_profiles','employer_profiles','worker_availability',
                           'jobs','applications','hires','attendance','payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- Haversine distance in km
CREATE OR REPLACE FUNCTION public.distance_km(lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
                                              lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN NULL
    ELSE 6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
  END $$;

-- ------------------------------------------------------- identity helpers
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), FALSE)
$$;

-- Can the caller see this user's private thread / job link?
CREATE OR REPLACE FUNCTION public.shares_engagement(other_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
     WHERE (a.worker_id = auth.uid() AND a.employer_id = other_user)
        OR (a.employer_id = auth.uid() AND a.worker_id = other_user)
    UNION ALL
    SELECT 1 FROM public.hires h
     WHERE (h.worker_id = auth.uid() AND h.employer_id = other_user)
        OR (h.employer_id = auth.uid() AND h.worker_id = other_user)
  )
$$;

-- ---------------------------------------------------- availability expiry
CREATE OR REPLACE FUNCTION public.expire_availability()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.worker_availability
     SET status = 'expired'
   WHERE status = 'active' AND available_until < NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.worker_profiles wp
     SET availability_status = 'offline'
   WHERE wp.availability_status = 'available'
     AND NOT EXISTS (SELECT 1 FROM public.worker_availability wa
                      WHERE wa.worker_id = wp.user_id AND wa.status = 'active'
                        AND wa.available_until > NOW());
  RETURN n;
END $$;

-- --------------------------------------------- attendance: derived values
-- Business rule: the mutually confirmed work period is
--   confirmed_in  = LATER of (worker_in, employer_in)
--   confirmed_out = EARLIER of (worker_out, employer_out)
-- i.e. only time both sides agree the worker was on site is paid.
CREATE OR REPLACE FUNCTION public.attendance_compute()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ot_hours NUMERIC(6,2) := 0;
  tot_hours NUMERIC(6,2) := 0;
BEGIN
  NEW.confirmed_in := CASE WHEN NEW.worker_in IS NOT NULL AND NEW.employer_in IS NOT NULL
                           THEN GREATEST(NEW.worker_in, NEW.employer_in) END;
  NEW.confirmed_out := CASE WHEN NEW.worker_out IS NOT NULL AND NEW.employer_out IS NOT NULL
                            THEN LEAST(NEW.worker_out, NEW.employer_out) END;

  IF NEW.attendance_status NOT IN ('absent','disputed') THEN
    IF NEW.confirmed_out IS NOT NULL THEN
      NEW.attendance_status := 'completed';
    ELSIF NEW.worker_out IS NOT NULL OR NEW.employer_out IS NOT NULL THEN
      NEW.attendance_status := 'pending_out';
    ELSIF NEW.confirmed_in IS NOT NULL THEN
      NEW.attendance_status := 'present';
    ELSIF NEW.worker_in IS NOT NULL OR NEW.employer_in IS NOT NULL THEN
      NEW.attendance_status := 'pending_in';
    ELSE
      NEW.attendance_status := 'not_started';
    END IF;
  END IF;

  IF NEW.confirmed_in IS NOT NULL AND NEW.confirmed_out IS NOT NULL THEN
    tot_hours := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NEW.confirmed_out - NEW.confirmed_in)) / 3600.0, 2));
    ot_hours  := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NEW.confirmed_out - NEW.scheduled_out)) / 3600.0, 2));
    ot_hours  := LEAST(ot_hours, tot_hours);
    NEW.total_hours     := tot_hours;
    NEW.overtime_hours  := ot_hours;
    NEW.regular_hours   := GREATEST(0, tot_hours - ot_hours);
    NEW.overtime_amount := ROUND(ot_hours * NEW.overtime_rate, 2);
    NEW.total_wage      := ROUND(NEW.daily_wage + NEW.overtime_amount, 2);
  ELSE
    NEW.total_hours := 0; NEW.overtime_hours := 0; NEW.regular_hours := 0;
    NEW.overtime_amount := 0; NEW.total_wage := 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_compute_trg ON public.attendance;
CREATE TRIGGER attendance_compute_trg BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_compute();

-- Attendance timestamps are append-only and side-owned.
CREATE OR REPLACE FUNCTION public.attendance_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'project_admin' THEN RETURN NEW; END IF;
  IF OLD.is_locked THEN
    RAISE EXCEPTION 'हाजिरी रिकॉर्ड लॉक है — बदलाव के लिए विवाद दर्ज करें';
  END IF;
  IF NEW.hire_id IS DISTINCT FROM OLD.hire_id
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.daily_wage IS DISTINCT FROM OLD.daily_wage
     OR NEW.overtime_rate IS DISTINCT FROM OLD.overtime_rate
     OR NEW.scheduled_in IS DISTINCT FROM OLD.scheduled_in
     OR NEW.scheduled_out IS DISTINCT FROM OLD.scheduled_out THEN
    RAISE EXCEPTION 'हाजिरी के मूल विवरण नहीं बदले जा सकते';
  END IF;
  -- once a timestamp is set it can never be silently overwritten
  IF OLD.worker_in IS NOT NULL AND NEW.worker_in IS DISTINCT FROM OLD.worker_in THEN
    RAISE EXCEPTION 'worker check-in पहले से दर्ज है'; END IF;
  IF OLD.employer_in IS NOT NULL AND NEW.employer_in IS DISTINCT FROM OLD.employer_in THEN
    RAISE EXCEPTION 'employer check-in पहले से दर्ज है'; END IF;
  IF OLD.worker_out IS NOT NULL AND NEW.worker_out IS DISTINCT FROM OLD.worker_out THEN
    RAISE EXCEPTION 'worker check-out पहले से दर्ज है'; END IF;
  IF OLD.employer_out IS NOT NULL AND NEW.employer_out IS DISTINCT FROM OLD.employer_out THEN
    RAISE EXCEPTION 'employer check-out पहले से दर्ज है'; END IF;
  -- a side may only write its own column
  IF auth.uid() = OLD.worker_id AND
     (NEW.employer_in IS DISTINCT FROM OLD.employer_in OR NEW.employer_out IS DISTINCT FROM OLD.employer_out) THEN
    RAISE EXCEPTION 'कामगार नियोक्ता की हाजिरी नहीं बदल सकता'; END IF;
  IF auth.uid() = OLD.employer_id AND
     (NEW.worker_in IS DISTINCT FROM OLD.worker_in OR NEW.worker_out IS DISTINCT FROM OLD.worker_out) THEN
    RAISE EXCEPTION 'नियोक्ता कामगार की हाजिरी नहीं बदल सकता'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_guard_trg ON public.attendance;
CREATE TRIGGER attendance_guard_trg BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_guard();

-- ------------------------------------------------- notification utilities
CREATE OR REPLACE FUNCTION public.notify_user(p_user UUID, p_type TEXT, p_title TEXT,
                                              p_message TEXT, p_link TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (p_user, p_type, p_title, p_message, p_link)
$$;

-- On day completion -> wage/payment record + notifications
CREATE OR REPLACE FUNCTION public.attendance_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.attendance_status = 'present' AND COALESCE(OLD.attendance_status,'') <> 'present' THEN
    PERFORM public.notify_user(NEW.worker_id, 'attendance_confirmed', 'हाजिरी दर्ज ✅',
      'दोनों तरफ से Check-IN हो गया। आपकी हाजिरी दर्ज है।', '/worker/hajri');
    PERFORM public.notify_user(NEW.employer_id, 'attendance_confirmed', 'हाजिरी दर्ज ✅',
      'कामगार की हाजिरी दोनों तरफ से पक्की हो गई।', '/employer/hajri');
  END IF;

  IF NEW.attendance_status = 'completed' AND COALESCE(OLD.attendance_status,'') <> 'completed' THEN
    INSERT INTO public.payments (hire_id, attendance_id, job_id, worker_id, employer_id, amount, status)
    SELECT NEW.hire_id, NEW.id, h.job_id, NEW.worker_id, NEW.employer_id, NEW.total_wage, 'pending'
      FROM public.hires h WHERE h.id = NEW.hire_id
    ON CONFLICT (attendance_id) DO UPDATE SET amount = EXCLUDED.amount;

    UPDATE public.hires SET status = 'completed' WHERE id = NEW.hire_id AND status <> 'disputed';
    UPDATE public.worker_profiles SET completed_jobs = completed_jobs + 1 WHERE user_id = NEW.worker_id;
    UPDATE public.employer_profiles SET completed_jobs = completed_jobs + 1 WHERE user_id = NEW.employer_id;

    PERFORM public.notify_user(NEW.worker_id, 'day_completed', 'दिन पूरा हुआ 🟢',
      'कुल मजदूरी ₹' || NEW.total_wage || ' दर्ज हुई। अब आप रेटिंग दे सकते हैं।', '/worker/earnings');
    PERFORM public.notify_user(NEW.employer_id, 'day_completed', 'दिन पूरा हुआ 🟢',
      'कुल भुगतान ₹' || NEW.total_wage || ' बकाया दर्ज हुआ।', '/employer/payments');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_after_trg ON public.attendance;
CREATE TRIGGER attendance_after_trg AFTER INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_after_change();

-- Keep worker wage ledger in sync
CREATE OR REPLACE FUNCTION public.payments_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.worker_profiles wp
     SET total_earned = COALESCE((SELECT SUM(p.amount) FROM public.payments p
                                   WHERE p.worker_id = wp.user_id), 0)
   WHERE wp.user_id = NEW.worker_id;
  IF TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    PERFORM public.notify_user(NEW.worker_id, 'payment_update', 'भुगतान प्राप्त 💰',
      '₹' || NEW.paid_amount || ' का भुगतान दर्ज हुआ।', '/worker/earnings');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_after_trg ON public.payments;
CREATE TRIGGER payments_after_trg AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_after_change();

-- Reviews -> reputation aggregates (and completed-job gate)
CREATE OR REPLACE FUNCTION public.review_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE h RECORD;
BEGIN
  SELECT * INTO h FROM public.hires WHERE id = NEW.hire_id;
  IF h IS NULL THEN RAISE EXCEPTION 'काम नहीं मिला'; END IF;
  IF h.status <> 'completed' THEN
    RAISE EXCEPTION 'रेटिंग केवल काम पूरा होने के बाद दी जा सकती है';
  END IF;
  IF NEW.reviewer_id NOT IN (h.worker_id, h.employer_id)
     OR NEW.reviewed_user_id NOT IN (h.worker_id, h.employer_id)
     OR NEW.reviewer_id = NEW.reviewed_user_id THEN
    RAISE EXCEPTION 'आप इस काम के लिए रेटिंग नहीं दे सकते';
  END IF;
  NEW.job_id := h.job_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS review_guard_trg ON public.reviews;
CREATE TRIGGER review_guard_trg BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.review_guard();

CREATE OR REPLACE FUNCTION public.review_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.reviewer_role = 'employer' THEN
    UPDATE public.worker_profiles wp SET
      rating_avg = (SELECT ROUND(AVG(rating),2) FROM public.reviews r WHERE r.reviewed_user_id = wp.user_id),
      rating_count = (SELECT COUNT(*) FROM public.reviews r WHERE r.reviewed_user_id = wp.user_id),
      work_score = LEAST(100, ROUND(
        (SELECT COALESCE(AVG(rating),0)*16 FROM public.reviews r WHERE r.reviewed_user_id = wp.user_id)
        + LEAST(20, wp.completed_jobs), 2))
    WHERE wp.user_id = NEW.reviewed_user_id;
  ELSE
    UPDATE public.employer_profiles ep SET
      rating_avg = (SELECT ROUND(AVG(rating),2) FROM public.reviews r WHERE r.reviewed_user_id = ep.user_id),
      rating_count = (SELECT COUNT(*) FROM public.reviews r WHERE r.reviewed_user_id = ep.user_id),
      employer_score = LEAST(100, ROUND(
        (SELECT COALESCE(AVG(rating),0)*16 FROM public.reviews r WHERE r.reviewed_user_id = ep.user_id)
        + LEAST(20, ep.completed_jobs), 2))
    WHERE ep.user_id = NEW.reviewed_user_id;
  END IF;
  PERFORM public.notify_user(NEW.reviewed_user_id, 'review_received', 'नई रेटिंग ⭐',
    NEW.rating || ' स्टार रेटिंग मिली।', NULL);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS review_after_trg ON public.reviews;
CREATE TRIGGER review_after_trg AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.review_after_insert();
