
-- Fix 1: Restrict DELETE on user_roles to owners only
DROP POLICY IF EXISTS "Owners admins can delete roles" ON public.user_roles;

CREATE POLICY "Only owners can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role));

-- Fix 2: Tighten student_datasets SELECT policy to approved roles only
DROP POLICY IF EXISTS "Authenticated users read datasets" ON public.student_datasets;

CREATE POLICY "Approved users can read datasets"
ON public.student_datasets
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'teacher'::app_role)
);
