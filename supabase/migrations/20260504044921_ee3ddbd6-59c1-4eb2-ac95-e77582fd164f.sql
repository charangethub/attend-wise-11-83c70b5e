WITH ranked_students AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY dataset, lower(trim(user_id_vedantu))
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_rank
  FROM public.students
  WHERE trim(coalesce(user_id_vedantu, '')) <> ''
), duplicate_students AS (
  SELECT id
  FROM ranked_students
  WHERE row_rank > 1
)
DELETE FROM public.students s
USING duplicate_students d
WHERE s.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS students_dataset_user_id_vedantu_uidx
ON public.students (dataset, lower(trim(user_id_vedantu)))
WHERE trim(coalesce(user_id_vedantu, '')) <> '';