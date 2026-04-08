
-- Create the updated_at helper function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create call_logs table
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  absent_date date NOT NULL,
  call_status text NOT NULL,
  absence_reason text,
  comment text,
  expected_return_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, absent_date)
);

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view call logs"
  ON public.call_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Authenticated users can insert call logs"
  ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Owners admins can update call logs"
  ON public.call_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can update own call logs"
  ON public.call_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND created_by = auth.uid());

CREATE POLICY "Owners admins can delete call logs"
  ON public.call_logs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_call_logs_updated_at
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
