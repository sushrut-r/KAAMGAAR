DELETE FROM auth.users WHERE email LIKE 'w\_%@test.dev' OR email LIKE 'e\_%@test.dev' OR email LIKE 'other\_%@test.dev';
