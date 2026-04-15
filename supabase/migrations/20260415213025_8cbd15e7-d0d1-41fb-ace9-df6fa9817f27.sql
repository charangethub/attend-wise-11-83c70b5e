
-- Create helper function that checks role AND active status
CREATE OR REPLACE FUNCTION public.is_active_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.user_status us ON us.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND us.status = 'active'
  );
$$;

-- Update students SELECT policy
DROP POLICY IF EXISTS "Approved users can view students" ON public.students;
CREATE POLICY "Approved users can view students" ON public.students
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update attendance SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
CREATE POLICY "Authenticated users can view attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update attendance INSERT policy
DROP POLICY IF EXISTS "Teachers admins owners can insert attendance" ON public.attendance;
CREATE POLICY "Teachers admins owners can insert attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_active_role(auth.uid(), 'teacher'::app_role) AND date = CURRENT_DATE)
  );

-- Update attendance teacher UPDATE policy
DROP POLICY IF EXISTS "Teachers can update today attendance" ON public.attendance;
CREATE POLICY "Teachers can update today attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (is_active_role(auth.uid(), 'teacher'::app_role) AND date = CURRENT_DATE)
  WITH CHECK (is_active_role(auth.uid(), 'teacher'::app_role) AND date = CURRENT_DATE);

-- Update call_logs SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view call logs" ON public.call_logs;
CREATE POLICY "Authenticated users can view call logs" ON public.call_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update call_logs INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert call logs" ON public.call_logs;
CREATE POLICY "Authenticated users can insert call logs" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update student_permissions SELECT policy
DROP POLICY IF EXISTS "Auth users can view permissions" ON public.student_permissions;
CREATE POLICY "Auth users can view permissions" ON public.student_permissions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update student_permissions INSERT policy
DROP POLICY IF EXISTS "Auth users can insert permissions" ON public.student_permissions;
CREATE POLICY "Auth users can insert permissions" ON public.student_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update inventory_items SELECT policy
DROP POLICY IF EXISTS "Auth users can view inventory" ON public.inventory_items;
CREATE POLICY "Auth users can view inventory" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update inventory_activity_logs SELECT policy
DROP POLICY IF EXISTS "Auth users can view inventory logs" ON public.inventory_activity_logs;
CREATE POLICY "Auth users can view inventory logs" ON public.inventory_activity_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update inventory_activity_logs INSERT policy
DROP POLICY IF EXISTS "Auth users can insert inventory logs" ON public.inventory_activity_logs;
CREATE POLICY "Auth users can insert inventory logs" ON public.inventory_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update distribution_status SELECT policy
DROP POLICY IF EXISTS "Auth users can view distribution" ON public.distribution_status;
CREATE POLICY "Auth users can view distribution" ON public.distribution_status
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update student_datasets SELECT policy
DROP POLICY IF EXISTS "Approved users can read datasets" ON public.student_datasets;
CREATE POLICY "Approved users can read datasets" ON public.student_datasets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

-- Update read-only tables to also require active status
DROP POLICY IF EXISTS "Auth read dataset_urls" ON public.dataset_urls;
CREATE POLICY "Auth read dataset_urls" ON public.dataset_urls
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Auth read sync_targets" ON public.sync_targets;
CREATE POLICY "Auth read sync_targets" ON public.sync_targets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Auth read inventory_urls" ON public.inventory_urls;
CREATE POLICY "Auth read inventory_urls" ON public.inventory_urls
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Auth users can view mappings" ON public.page_dataset_mapping;
CREATE POLICY "Auth users can view mappings" ON public.page_dataset_mapping
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_active_role(auth.uid(), 'teacher'::app_role)
  );
