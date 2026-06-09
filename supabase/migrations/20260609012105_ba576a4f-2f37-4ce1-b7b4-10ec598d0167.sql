DROP INDEX IF EXISTS public.students_roll_no_dataset_uniq;

CREATE UNIQUE INDEX students_roll_no_dataset_uniq
ON public.students (dataset, roll_no)
WHERE trim(coalesce(roll_no, '')) <> ''
  AND trim(coalesce(user_id_vedantu, '')) = '';