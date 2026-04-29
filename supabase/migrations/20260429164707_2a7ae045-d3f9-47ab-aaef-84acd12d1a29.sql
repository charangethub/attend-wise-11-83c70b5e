-- Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC and anon.
-- Authenticated users only need access for functions used in app code paths.
-- RLS policies that call these functions execute server-side as the policy
-- evaluator and are NOT affected by these grants.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.canonical_item_key(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.normalize_inventory_grade_bucket(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_marked_by() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_activity_log_metadata() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_user_roles_user_id_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_attendance_on_permission_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_inventory_on_distribution() FROM PUBLIC, anon, authenticated;

-- Owner-only admin function: keep EXECUTE for authenticated (caller is checked inside),
-- but revoke from anon.
REVOKE EXECUTE ON FUNCTION public.restore_attendance_from_logs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_attendance_from_logs(date, integer, integer) FROM PUBLIC, anon;
