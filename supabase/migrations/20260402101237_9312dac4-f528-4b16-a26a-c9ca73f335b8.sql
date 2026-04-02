
DROP POLICY IF EXISTS "Admins manage datasets" ON public.student_datasets;

CREATE POLICY "Admins manage datasets"
ON public.student_datasets
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
