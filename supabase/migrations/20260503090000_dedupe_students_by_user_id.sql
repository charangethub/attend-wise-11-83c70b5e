-- Vedantu user IDs can be shared by siblings or reused across different batch enrollments.
-- Do not enforce uniqueness on user_id_vedantu by itself.

begin;

drop index if exists public.students_dataset_user_id_vedantu_unique;

create index if not exists students_dataset_user_id_roll_no_idx
on public.students (dataset, lower(btrim(user_id_vedantu)), lower(btrim(roll_no)))
where nullif(btrim(user_id_vedantu), '') is not null
  and nullif(btrim(roll_no), '') is not null;

create index if not exists students_dataset_user_id_order_id_idx
on public.students (dataset, lower(btrim(user_id_vedantu)), lower(btrim(order_id)))
where nullif(btrim(user_id_vedantu), '') is not null
  and nullif(btrim(order_id), '') is not null;

commit;
