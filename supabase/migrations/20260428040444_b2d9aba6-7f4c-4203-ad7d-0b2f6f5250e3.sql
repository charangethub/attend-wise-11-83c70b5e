-- Drop the single-argument overload that conflicts with the two-arg version
-- (which already has _curriculum DEFAULT NULL and handles the single-arg call site).
DROP FUNCTION IF EXISTS public.normalize_inventory_grade_bucket(text);
