-- 1. exam_marks table
CREATE TABLE IF NOT EXISTS public.exam_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('quarterly', 'half_yearly', 'pre_final_1', 'pre_final_2')),
  student_user_id TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  roll_number TEXT NOT NULL DEFAULT '',
  classroom TEXT NOT NULL DEFAULT '',
  curriculum TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  enrollment_status TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  max_marks NUMERIC NOT NULL DEFAULT 100,
  obtained_marks NUMERIC NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_type, student_user_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_exam_marks_lookup ON public.exam_marks (exam_type, student_user_id);

ALTER TABLE public.exam_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can view exam marks" ON public.exam_marks;
CREATE POLICY "Auth users can view exam marks"
  ON public.exam_marks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Auth users can insert exam marks" ON public.exam_marks;
CREATE POLICY "Auth users can insert exam marks"
  ON public.exam_marks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Auth users can update exam marks" ON public.exam_marks;
CREATE POLICY "Auth users can update exam marks"
  ON public.exam_marks FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_active_role(auth.uid(), 'teacher'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_active_role(auth.uid(), 'teacher'::app_role)
  );

DROP POLICY IF EXISTS "Owners admins can delete exam marks" ON public.exam_marks;
CREATE POLICY "Owners admins can delete exam marks"
  ON public.exam_marks FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS exam_marks_set_updated_at ON public.exam_marks;
CREATE TRIGGER exam_marks_set_updated_at
  BEFORE UPDATE ON public.exam_marks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. purpose column on sync_targets (already exists with default 'attendance' per schema, but harden it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sync_targets' AND column_name='purpose'
  ) THEN
    ALTER TABLE public.sync_targets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'attendance';
  END IF;
END$$;

-- Drop existing check (if any) and add the right one
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.sync_targets'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%purpose%'
  LOOP
    EXECUTE format('ALTER TABLE public.sync_targets DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE public.sync_targets
  ADD CONSTRAINT sync_targets_purpose_check CHECK (purpose IN ('attendance', 'marks'));

-- Backfill any NULLs just in case
UPDATE public.sync_targets SET purpose = 'attendance' WHERE purpose IS NULL OR purpose = '';

-- 3. Auto-migrate legacy single google_apps_script_url -> sync_targets (attendance)
DO $$
DECLARE legacy_url TEXT;
BEGIN
  SELECT value INTO legacy_url FROM public.system_settings WHERE key = 'google_apps_script_url';
  IF legacy_url IS NOT NULL AND length(trim(legacy_url)) > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.sync_targets WHERE apps_script_url = legacy_url) THEN
      INSERT INTO public.sync_targets (label, apps_script_url, purpose, is_active)
      VALUES ('Legacy Attendance URL', legacy_url, 'attendance', true);
    END IF;
  END IF;
END$$;

-- 4. results_sheet_gid setting
INSERT INTO public.system_settings (key, value, is_public)
VALUES ('results_sheet_gid', '1074701588', true)
ON CONFLICT (key) DO NOTHING;