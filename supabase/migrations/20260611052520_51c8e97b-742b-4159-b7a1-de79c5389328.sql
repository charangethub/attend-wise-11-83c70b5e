
-- 1) call_logs: replace has_role with is_active_role for owner/admin in write policies
DROP POLICY IF EXISTS "Authenticated users can insert call logs" ON public.call_logs;
CREATE POLICY "Authenticated users can insert call logs" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Owners admins can delete call logs" ON public.call_logs;
CREATE POLICY "Owners admins can delete call logs" ON public.call_logs
  FOR DELETE TO authenticated
  USING (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Owners admins can update call logs" ON public.call_logs;
CREATE POLICY "Owners admins can update call logs" ON public.call_logs
  FOR UPDATE TO authenticated
  USING (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
  );

-- 2) exam_marks
DROP POLICY IF EXISTS "Auth users can insert exam marks" ON public.exam_marks;
CREATE POLICY "Auth users can insert exam marks" ON public.exam_marks
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Auth users can update exam marks" ON public.exam_marks;
CREATE POLICY "Auth users can update exam marks" ON public.exam_marks
  FOR UPDATE TO authenticated
  USING (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  )
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Owners admins can delete exam marks" ON public.exam_marks;
CREATE POLICY "Owners admins can delete exam marks" ON public.exam_marks
  FOR DELETE TO authenticated
  USING (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
  );

-- 3) inventory_activity_logs
DROP POLICY IF EXISTS "Auth users can insert inventory logs" ON public.inventory_activity_logs;
CREATE POLICY "Auth users can insert inventory logs" ON public.inventory_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- 4) student_permissions
DROP POLICY IF EXISTS "Auth users can insert permissions" ON public.student_permissions;
CREATE POLICY "Auth users can insert permissions" ON public.student_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Owners admins can delete permissions" ON public.student_permissions;
CREATE POLICY "Owners admins can delete permissions" ON public.student_permissions
  FOR DELETE TO authenticated
  USING (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR is_active_role(auth.uid(), 'admin'::app_role)
  );

-- 5) user_roles: tighten admin update USING to restrict target rows to teacher with no admin panel access
DROP POLICY IF EXISTS "Owners admins can update roles" ON public.user_roles;
CREATE POLICY "Owners admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR (
      is_active_role(auth.uid(), 'admin'::app_role)
      AND user_id <> auth.uid()
      AND NOT has_role(user_id, 'owner'::app_role)
      AND role = 'teacher'::app_role
      AND admin_panel_access = false
    )
  )
  WITH CHECK (
    is_active_role(auth.uid(), 'owner'::app_role)
    OR (
      is_active_role(auth.uid(), 'admin'::app_role)
      AND user_id <> auth.uid()
      AND NOT has_role(user_id, 'owner'::app_role)
      AND role = 'teacher'::app_role
      AND admin_panel_access = false
    )
  );

DROP POLICY IF EXISTS "Only owners can insert roles" ON public.user_roles;
CREATE POLICY "Only owners can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (is_active_role(auth.uid(), 'owner'::app_role));

DROP POLICY IF EXISTS "Only owners can delete roles" ON public.user_roles;
CREATE POLICY "Only owners can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (is_active_role(auth.uid(), 'owner'::app_role));
