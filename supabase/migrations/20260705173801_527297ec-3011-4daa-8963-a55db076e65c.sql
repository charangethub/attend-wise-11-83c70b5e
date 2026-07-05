
-- 1) Fix exam_marks UPDATE: teachers can only update rows they created
DROP POLICY IF EXISTS "Auth users can update exam marks" ON public.exam_marks;

CREATE POLICY "Owners admins can update exam marks"
ON public.exam_marks FOR UPDATE
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role))
WITH CHECK (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can update own exam marks"
ON public.exam_marks FOR UPDATE
USING (is_active_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid())
WITH CHECK (is_active_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid());

-- 2) Harden SELECT policies: replace has_role with is_active_role for owner/admin branches
-- activity_logs
DROP POLICY IF EXISTS "Owners admins can view logs" ON public.activity_logs;
CREATE POLICY "Owners admins can view logs"
ON public.activity_logs FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role));

-- attendance
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
CREATE POLICY "Authenticated users can view attendance"
ON public.attendance FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- call_logs
DROP POLICY IF EXISTS "Authenticated users can view call logs" ON public.call_logs;
CREATE POLICY "Authenticated users can view call logs"
ON public.call_logs FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- dataset_urls
DROP POLICY IF EXISTS "Auth read dataset_urls" ON public.dataset_urls;
CREATE POLICY "Auth read dataset_urls"
ON public.dataset_urls FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- distribution_status
DROP POLICY IF EXISTS "Auth users can view distribution" ON public.distribution_status;
CREATE POLICY "Auth users can view distribution"
ON public.distribution_status FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- exam_marks
DROP POLICY IF EXISTS "Auth users can view exam marks" ON public.exam_marks;
CREATE POLICY "Auth users can view exam marks"
ON public.exam_marks FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- students, profiles, user_roles, inventory_*, student_datasets, page_dataset_mapping, inventory_urls
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname='public'
      AND cmd='SELECT'
      AND tablename IN ('students','profiles','user_roles','inventory_items','inventory_activity_logs','student_datasets','page_dataset_mapping','inventory_urls')
      AND qual LIKE '%has_role(%'
  LOOP
    -- handled individually below
    NULL;
  END LOOP;
END $$;

-- students
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='students' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.students', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Auth users can view students"
ON public.students FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- profiles: keep self-select; harden owner/admin
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, qual FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);
CREATE POLICY "Owners admins can view all profiles"
ON public.profiles FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role));

-- user_roles: keep self view; harden owner/admin
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);
CREATE POLICY "Owners admins can view all roles"
ON public.user_roles FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role));

-- inventory_items
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inventory_items' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_items', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Auth users can view inventory"
ON public.inventory_items FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- inventory_activity_logs
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inventory_activity_logs' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_activity_logs', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Owners admins can view inventory logs"
ON public.inventory_activity_logs FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role));

-- student_datasets
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='student_datasets' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_datasets', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Auth users can view student_datasets"
ON public.student_datasets FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- page_dataset_mapping
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='page_dataset_mapping' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.page_dataset_mapping', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Auth users can view page_dataset_mapping"
ON public.page_dataset_mapping FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));

-- inventory_urls
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='inventory_urls' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_urls', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Auth read inventory_urls"
ON public.inventory_urls FOR SELECT
USING (is_active_role(auth.uid(), 'owner'::app_role) OR is_active_role(auth.uid(), 'admin'::app_role) OR is_active_role(auth.uid(), 'teacher'::app_role));
