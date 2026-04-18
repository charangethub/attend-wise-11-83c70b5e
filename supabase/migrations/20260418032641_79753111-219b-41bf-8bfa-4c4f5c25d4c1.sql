-- Tighten user_roles UPDATE policy to prevent admin self-escalation and user_id reassignment
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
    AND role <> 'owner'::app_role
  )
);

-- Prevent user_id from being changed on update (locks the role record to its user)
CREATE OR REPLACE FUNCTION public.prevent_user_roles_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing user_id on user_roles is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_roles_user_id_change ON public.user_roles;
CREATE TRIGGER trg_prevent_user_roles_user_id_change
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_roles_user_id_change();