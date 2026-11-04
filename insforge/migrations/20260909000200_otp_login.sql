-- कामगार — मोबाइल OTP लॉगिन (SMS)
--
-- How it works:
--   1. The edge function `otp_send` (see scripts/otp_send_function.js) looks the user up
--      by mobile, generates a 6-digit code, hashes it with bcrypt(10) — the same hash
--      format InsForge's own email-OTP verification uses — and stores it in
--      auth.email_otps via the SECURITY DEFINER function below.
--   2. The code is delivered by SMS (MSG91) — or, while no MSG91 credentials are
--      configured, returned to the UI as `dev_code` so the flow can be tested.
--   3. The browser then signs in with InsForge's built-in passwordless endpoint:
--      POST /api/auth/sessions { method: 'otp', email: <alias>, otp: <code> }
--      which verifies the code against the stored bcrypt hash and creates a normal
--      session. The user's password is never touched.
--
-- Security:
--   * otp_store_code requires the dispatch secret from system_config (RLS denies all
--     direct access; only SECURITY DEFINER code can read it). The secret is embedded in
--     the edge function (admin-key trust level, same as the admin API key itself).
--   * Per-email rate limit: 3 codes / 15 min. Global: 40 codes / 10 min.
--   * Only alias emails of existing, non-suspended users can receive codes.

CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_config (key, value)
-- SECURITY: the real otp_dispatch_secret value is masked in the public repo.
-- The live database already holds the real value; keep the secret in
-- functions/otp_send.js.local (gitignored) for future deploys.
VALUES ('otp_dispatch_secret', 'REPLACE_WITH_SECRET_FROM_LOCAL_COPY')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- login-lookup by mobile number
CREATE OR REPLACE FUNCTION public.otp_lookup_user(p_mobile TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  m   TEXT;
  out JSON;
BEGIN
  m := regexp_replace(COALESCE(p_mobile, ''), '\D', '', 'g');
  IF length(m) <> 10 THEN
    RETURN jsonb_build_object('exists', false)::json;
  END IF;
  SELECT jsonb_build_object(
    'exists', true,
    'email', '91' || p.phone || '@mobile.kaamgaar.app',
    'role',   p.role,
    'name',   p.name
  ) INTO out
  FROM public.profiles p
  WHERE p.phone = m AND p.is_suspended = false;
  IF out IS NULL THEN
    RETURN jsonb_build_object('exists', false)::json;
  END IF;
  RETURN out;
END; $$;

-- store a pre-hashed OTP code into InsForge's auth email_OTP table
CREATE OR REPLACE FUNCTION public.otp_store_code(p_email TEXT, p_hash TEXT, p_secret TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  recent INTEGER;
  global INTEGER;
BEGIN
  IF p_secret IS DISTINCT FROM (SELECT value FROM public.system_config WHERE key = 'otp_dispatch_secret') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_email IS NULL OR p_email !~ '^91[0-9]{10}@mobile\.kaamgaar\.app$' THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  SELECT count(*) INTO recent
  FROM auth.email_otps
  WHERE email = p_email AND created_at > now() - interval '15 minutes';
  IF recent >= 3 THEN
    RAISE EXCEPTION 'थोड़ी देर बाद दोबारा कोशिश करें (OTP limit)';
  END IF;
  SELECT count(*) INTO global
  FROM auth.email_otps
  WHERE created_at > now() - interval '10 minutes';
  IF global >= 40 THEN
    RAISE EXCEPTION 'OTP limit';
  END IF;
  DELETE FROM auth.email_otps WHERE email = p_email AND consumed_at IS NULL;
  INSERT INTO auth.email_otps (email, otp_hash, otp_type, purpose, expires_at)
  VALUES (p_email, p_hash, 'NUMERIC_CODE', 'SIGN_IN', now() + interval '5 minutes');
  RETURN 'stored';
END; $$;

-- cleanup of temporary inspection functions
DROP FUNCTION IF EXISTS public.tmp_inspect_auth();
DROP FUNCTION IF EXISTS public.tmp_peek_otp(TEXT);
DROP FUNCTION IF EXISTS public.tmp_otp_store(TEXT, TEXT);
