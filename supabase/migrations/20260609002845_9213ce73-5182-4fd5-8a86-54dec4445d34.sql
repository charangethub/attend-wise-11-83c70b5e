DROP POLICY IF EXISTS "Teachers can update own call logs" ON public.call_logs;
CREATE POLICY "Teachers can update own call logs"
ON public.call_logs
FOR UPDATE
TO authenticated
USING (public.is_active_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid())
WITH CHECK (public.is_active_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid());