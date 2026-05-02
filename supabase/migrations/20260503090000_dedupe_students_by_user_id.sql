-- Merge duplicate student rows that share the same Vedantu user ID inside a dataset,
-- then enforce that each dataset can contain a non-empty user_id_vedantu only once.
-- Attendance rows from removed duplicates are moved to the surviving student first.

begin;

create temp table duplicate_student_groups on commit drop as
with ranked as (
  select
    id,
    first_value(id) over (
      partition by dataset, lower(btrim(user_id_vedantu))
      order by
        nullif(btrim(roll_no), '') is null,
        updated_at desc nulls last,
        created_at desc nulls last,
        id
    ) as keeper_id,
    row_number() over (
      partition by dataset, lower(btrim(user_id_vedantu))
      order by
        nullif(btrim(roll_no), '') is null,
        updated_at desc nulls last,
        created_at desc nulls last,
        id
    ) as rn
  from public.students
  where nullif(btrim(user_id_vedantu), '') is not null
)
select id as duplicate_id, keeper_id
from ranked
where rn > 1;

-- Preserve attendance from duplicate student IDs. If the keeper already has a row
-- for the same date/session, keep the keeper row and only fill an empty remark.
insert into public.attendance (
  student_id,
  date,
  session,
  status,
  remark,
  marked_by,
  created_at,
  updated_at
)
select
  d.keeper_id,
  a.date,
  a.session,
  a.status,
  a.remark,
  a.marked_by,
  a.created_at,
  a.updated_at
from public.attendance a
join duplicate_student_groups d on d.duplicate_id = a.student_id
on conflict (student_id, date, session) do update
set
  remark = coalesce(nullif(public.attendance.remark, ''), excluded.remark),
  updated_at = greatest(public.attendance.updated_at, excluded.updated_at);

delete from public.attendance a
using duplicate_student_groups d
where a.student_id = d.duplicate_id;

update public.call_logs c
set student_id = d.keeper_id
from duplicate_student_groups d
where c.student_id = d.duplicate_id;

update public.distribution_status ds
set student_id = d.keeper_id
from duplicate_student_groups d
where ds.student_id = d.duplicate_id;

update public.student_permissions sp
set student_id = d.keeper_id
from duplicate_student_groups d
where sp.student_id = d.duplicate_id;

delete from public.students s
using duplicate_student_groups d
where s.id = d.duplicate_id;

create unique index if not exists students_dataset_user_id_vedantu_unique
on public.students (dataset, lower(btrim(user_id_vedantu)))
where nullif(btrim(user_id_vedantu), '') is not null;

commit;
