-- कामगार (Kaamgaar) — core schema
-- All user references point at auth.users(id). worker_id / employer_id ARE auth user ids.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('worker','employer','admin')),
  name                TEXT NOT NULL,
  phone               TEXT,
  email               TEXT,
  profile_photo       TEXT,
  profile_photo_key   TEXT,
  location            TEXT,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  language            TEXT NOT NULL DEFAULT 'hi',
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected')),
  is_flagged          BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason         TEXT,
  is_suspended        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON public.profiles (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- ------------------------------------------------------- worker_profiles
CREATE TABLE IF NOT EXISTS public.worker_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  experience          INTEGER NOT NULL DEFAULT 0,
  expected_daily_wage NUMERIC(10,2) NOT NULL DEFAULT 0,
  availability_status TEXT NOT NULL DEFAULT 'offline'
                      CHECK (availability_status IN ('available','offline','hired')),
  work_radius         NUMERIC(6,2) NOT NULL DEFAULT 5,
  work_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
  bio                 TEXT,
  rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count        INTEGER NOT NULL DEFAULT 0,
  completed_jobs      INTEGER NOT NULL DEFAULT 0,
  total_earned        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------- employer_profiles
CREATE TABLE IF NOT EXISTS public.employer_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name        TEXT,
  business_type       TEXT,
  location            TEXT,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected')),
  employer_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count        INTEGER NOT NULL DEFAULT 0,
  jobs_posted         INTEGER NOT NULL DEFAULT 0,
  workers_hired       INTEGER NOT NULL DEFAULT 0,
  completed_jobs      INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------ skills
CREATE TABLE IF NOT EXISTS public.skills (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL UNIQUE,
  name_hi   TEXT NOT NULL,
  category  TEXT NOT NULL DEFAULT 'construction',
  icon      TEXT NOT NULL DEFAULT '🔨',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------- worker_skills
CREATE TABLE IF NOT EXISTS public.worker_skills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id            UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  experience          INTEGER NOT NULL DEFAULT 0,
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, skill_id)
);

-- ------------------------------------------------------ worker_availability
CREATE TABLE IF NOT EXISTS public.worker_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id        UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  location        TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  radius          NUMERIC(6,2) NOT NULL DEFAULT 5,
  available_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_until TIMESTAMPTZ NOT NULL,
  available_time  TEXT,
  expected_wage   NUMERIC(10,2) NOT NULL DEFAULT 0,
  job_type        TEXT NOT NULL DEFAULT 'daily' CHECK (job_type IN ('daily','weekly','contract')),
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','hired','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS worker_availability_status_idx
  ON public.worker_availability (status, available_until);

-- -------------------------------------------------------------------- jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id         UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  workers_required INTEGER NOT NULL DEFAULT 1 CHECK (workers_required > 0),
  workers_hired    INTEGER NOT NULL DEFAULT 0,
  location         TEXT NOT NULL,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  start_date       DATE NOT NULL,
  start_time       TIME NOT NULL DEFAULT '08:00',
  end_time         TIME NOT NULL DEFAULT '18:00',
  daily_wage       NUMERIC(10,2) NOT NULL CHECK (daily_wage >= 0),
  overtime_rate    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (overtime_rate >= 0),
  duration         TEXT NOT NULL DEFAULT '1 din',
  duration_days    INTEGER NOT NULL DEFAULT 1,
  food             BOOLEAN NOT NULL DEFAULT FALSE,
  transport        BOOLEAN NOT NULL DEFAULT FALSE,
  other_facilities TEXT,
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','filled','in_progress','completed','cancelled','flagged')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON public.jobs (status, start_date);
CREATE INDEX IF NOT EXISTS jobs_employer_idx ON public.jobs (employer_id);

-- ------------------------------------------------------------ applications
CREATE TABLE IF NOT EXISTS public.applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL DEFAULT 'worker_applied'
              CHECK (source IN ('worker_applied','employer_invited')),
  status      TEXT NOT NULL DEFAULT 'applied'
              CHECK (status IN ('applied','shortlisted','invited','accepted','rejected','cancelled')),
  message     TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, worker_id)
);
CREATE INDEX IF NOT EXISTS applications_worker_idx ON public.applications (worker_id, status);
CREATE INDEX IF NOT EXISTS applications_job_idx ON public.applications (job_id, status);

-- ------------------------------------------------------------------ hires
CREATE TABLE IF NOT EXISTS public.hires (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  worker_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id       UUID REFERENCES public.skills(id) ON DELETE SET NULL,
  work_date      DATE NOT NULL,
  daily_wage     NUMERIC(10,2) NOT NULL,
  overtime_rate  NUMERIC(10,2) NOT NULL DEFAULT 0,
  scheduled_in   TIME NOT NULL DEFAULT '08:00',
  scheduled_out  TIME NOT NULL DEFAULT '18:00',
  hired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         TEXT NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','disputed')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, worker_id)
);
CREATE INDEX IF NOT EXISTS hires_worker_idx ON public.hires (worker_id, status);
CREATE INDEX IF NOT EXISTS hires_employer_idx ON public.hires (employer_id, status);

-- ------------------------------------------------------------- attendance
CREATE TABLE IF NOT EXISTS public.attendance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id           UUID NOT NULL REFERENCES public.hires(id) ON DELETE CASCADE,
  worker_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  scheduled_in      TIMESTAMPTZ NOT NULL,
  scheduled_out     TIMESTAMPTZ NOT NULL,
  daily_wage        NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_rate     NUMERIC(10,2) NOT NULL DEFAULT 0,
  worker_in         TIMESTAMPTZ,
  employer_in       TIMESTAMPTZ,
  worker_out        TIMESTAMPTZ,
  employer_out      TIMESTAMPTZ,
  attendance_status TEXT NOT NULL DEFAULT 'not_started'
                    CHECK (attendance_status IN
                    ('not_started','pending_in','present','pending_out','completed','absent','disputed')),
  confirmed_in      TIMESTAMPTZ,
  confirmed_out     TIMESTAMPTZ,
  regular_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_hours    NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_wage        NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hire_id, date)
);
CREATE INDEX IF NOT EXISTS attendance_worker_idx ON public.attendance (worker_id, date);
CREATE INDEX IF NOT EXISTS attendance_employer_idx ON public.attendance (employer_id, date);

-- --------------------------------------------------------------- payments
CREATE TABLE IF NOT EXISTS public.payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id       UUID NOT NULL REFERENCES public.hires(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendance(id) ON DELETE SET NULL,
  job_id        UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  worker_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','partial','paid','disputed')),
  method        TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','upi','bank','other')),
  payment_date  TIMESTAMPTZ,
  reference     TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attendance_id)
);
CREATE INDEX IF NOT EXISTS payments_worker_idx ON public.payments (worker_id, status);
CREATE INDEX IF NOT EXISTS payments_employer_idx ON public.payments (employer_id, status);

-- ---------------------------------------------------------------- reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  hire_id          UUID NOT NULL REFERENCES public.hires(id) ON DELETE CASCADE,
  reviewer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_role    TEXT NOT NULL CHECK (reviewer_role IN ('worker','employer')),
  rating           NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  categories       JSONB NOT NULL DEFAULT '{}'::jsonb,
  review           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hire_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS reviews_reviewed_idx ON public.reviews (reviewed_user_id);

-- --------------------------------------------------------------- messages
CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image')),
  attachment_url TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON public.messages (job_id, created_at);
CREATE INDEX IF NOT EXISTS messages_parties_idx ON public.messages (sender_id, receiver_id);

-- ---------------------------------------------------------- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,
  read_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, read_status, created_at DESC);

-- --------------------------------------------------------------- disputes
CREATE TABLE IF NOT EXISTS public.disputes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  hire_id      UUID REFERENCES public.hires(id) ON DELETE SET NULL,
  attendance_id UUID REFERENCES public.attendance(id) ON DELETE SET NULL,
  raised_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  against_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type         TEXT NOT NULL CHECK (type IN
               ('attendance','overtime','payment','wrong_wage','job_cancellation','misleading_job','workplace','other')),
  description  TEXT NOT NULL,
  evidence     TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','under_review','resolved','rejected')),
  resolution   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

-- -------------------------------------------------------------- portfolio
CREATE TABLE IF NOT EXISTS public.portfolio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url    TEXT NOT NULL,
  file_key    TEXT,
  kind        TEXT NOT NULL DEFAULT 'work_photo'
              CHECK (kind IN ('work_photo','certificate','skill_proof','identity')),
  title       TEXT,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portfolio_worker_idx ON public.portfolio (worker_id);

-- ------------------------------------------------------- activity (fraud)
CREATE TABLE IF NOT EXISTS public.activity_flags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entity     TEXT NOT NULL,
  entity_id  UUID,
  reason     TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
