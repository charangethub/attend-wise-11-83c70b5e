DROP POLICY IF EXISTS "Owners admins can update roles" ON public.user_roles;

CREATE POLICY "Owners admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND user_id <> auth.uid()
    AND NOT has_role(user_id, 'owner'::app_role)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role)
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND user_id <> auth.uid()
    AND NOT has_role(user_id, 'owner'::app_role)
    AND role = 'teacher'::app_role
    AND admin_panel_access = false
  )
);