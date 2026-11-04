-- कामगार — move existing email-based logins onto mobile-number login
--
-- Password auth reads auth.users.email + auth.users.password directly (there are no
-- provider rows for email accounts), so rewriting the address to the mobile alias keeps
-- the existing password working — the user simply signs in with their number instead.
-- Accounts whose profile has no valid Indian mobile are left untouched.

UPDATE auth.users u
   SET email = '91' || p.phone || '@mobile.kaamgaar.app',
       email_verified = TRUE
  FROM public.profiles p
 WHERE p.id = u.id
   AND p.phone ~ '^[6-9][0-9]{9}$'
   AND u.email !~ '@mobile\.kaamgaar\.app$'
   AND NOT EXISTS (
         SELECT 1 FROM auth.users x
          WHERE x.email = '91' || p.phone || '@mobile.kaamgaar.app' AND x.id <> u.id);

-- keep the mirrored address on the profile in sync
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

DROP TABLE IF EXISTS public._auth_introspect;
