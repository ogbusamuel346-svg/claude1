-- Allow permanent cleanup only for archived student records with no linked
-- account, family links, attendance, or assessment results. Keep an audit row.

create table if not exists public.student_record_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  admission_number text not null,
  deleted_by uuid not null references public.profiles(id),
  reason text not null,
  deleted_at timestamptz not null default now()
);

alter table public.student_record_deletion_audit enable row level security;
grant select on public.student_record_deletion_audit to authenticated;

create policy "student_deletion_audit_admin_read" on public.student_record_deletion_audit
  for select to authenticated using (public.current_school_role() = 'school_admin');

create or replace function public.permanently_delete_archived_student(
  p_student_id text,
  p_confirm_admission_number text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  student_row public.students%rowtype;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if public.current_school_role() is distinct from 'school_admin' then
    raise exception 'Only school administrators can permanently delete student records.' using errcode = '42501';
  end if;

  select * into student_row
    from public.students
   where id = p_student_id
   for update;

  if not found then
    raise exception 'Student record was not found.' using errcode = 'P0002';
  end if;
  if student_row.status <> 'Archived' then
    raise exception 'Archive the student before requesting permanent deletion.' using errcode = 'P0001';
  end if;
  if student_row.admission_number <> trim(coalesce(p_confirm_admission_number, '')) then
    raise exception 'The admission number confirmation does not match.' using errcode = 'P0001';
  end if;
  if length(clean_reason) < 10 then
    raise exception 'Enter a deletion reason of at least 10 characters.' using errcode = 'P0001';
  end if;
  if student_row.user_id is not null then
    raise exception 'This student has a login account. Unlink or retain the account before deletion.' using errcode = '23503';
  end if;
  if exists (select 1 from public.parent_student_links where student_id = student_row.id) then
    raise exception 'This student has parent or guardian links. Remove those links before deletion.' using errcode = '23503';
  end if;
  if exists (select 1 from public.attendance_records where student_id = student_row.id) then
    raise exception 'This student has attendance history. Keep the record archived.' using errcode = '23503';
  end if;
  if exists (select 1 from public.assessment_results where student_id = student_row.id) then
    raise exception 'This student has assessment history. Keep the record archived.' using errcode = '23503';
  end if;

  insert into public.student_record_deletion_audit (student_id, admission_number, deleted_by, reason)
  values (student_row.id, student_row.admission_number, auth.uid(), clean_reason);

  delete from public.students where id = student_row.id;
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.permanently_delete_archived_student(text, text, text) from public;
grant execute on function public.permanently_delete_archived_student(text, text, text) to authenticated;
