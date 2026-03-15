
-- Add session column to attendance table
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS session text NOT NULL DEFAULT 'AM';

-- Drop the old unique constraint on (student_id, date)
-- First find and drop it
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'attendance' 
    AND tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
  LIMIT 1;
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.attendance DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Add new unique constraint on (student_id, date, session)
ALTER TABLE public.attendance ADD CONSTRAINT attendance_student_date_session_unique UNIQUE (student_id, date, session);
