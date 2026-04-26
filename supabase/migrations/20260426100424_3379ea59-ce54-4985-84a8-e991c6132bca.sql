ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_roll_no_key;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_roll_no_not_empty;

CREATE UNIQUE INDEX IF NOT EXISTS students_roll_no_dataset_uniq
  ON public.students (dataset, roll_no)
  WHERE roll_no IS NOT NULL AND TRIM(roll_no) <> '';
