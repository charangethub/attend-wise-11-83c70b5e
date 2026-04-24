DROP POLICY IF EXISTS "Auth read sync_targets" ON public.sync_targets;

CREATE POLICY "Owners admins can read sync_targets"
ON public.sync_targets
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);