-- कामगार — पुराने function overloads हटाएं
--
-- पिछला migration create_my_profile / submit_review के NEW signatures के साथ
-- CREATE OR REPLACE चलाता था, लेकिन PostgreSQL केवल बिल्कुल समान parameter
-- list को ही replace करता है — अलग signature एक नया overload बना देती है।
-- दोनों versions मौजूद रहने से 10/4-argument calls ambiguous हो जाती थीं (PGRST203)।

DROP FUNCTION IF EXISTS public.create_my_profile(
  text, text, text, text, double precision, double precision,
  text, text, integer, numeric);

DROP FUNCTION IF EXISTS public.submit_review(uuid, numeric, jsonb, text);
