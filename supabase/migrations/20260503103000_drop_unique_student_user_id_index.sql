-- Safety follow-up for environments where an earlier migration already created
-- a unique index on user_id_vedantu. Shared Vedantu user IDs are valid.

begin;

drop index if exists public.students_dataset_user_id_vedantu_unique;

commit;
