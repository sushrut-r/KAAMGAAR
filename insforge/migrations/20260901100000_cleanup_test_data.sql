DELETE FROM auth.users WHERE email LIKE 'worker\_%@test.dev' OR email LIKE 'employer\_%@test.dev' OR email LIKE 'other\_%@test.dev';
