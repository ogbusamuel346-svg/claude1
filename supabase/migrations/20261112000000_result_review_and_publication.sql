-- Teacher-entered results remain private until reviewed and published by an
-- administrator. Existing results remain visible during this transition.

alter table public.assessment_results
  add column if not exists publication_status text not null default 'published'
    check (publication_status in ('draft', 'needs_revision', 'published'));
alter table public.assessment_results
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.assessment_results
  add column if not exists reviewed_at timestamptz;
alter table public.assessment_results
  add column if not exists review_note text not null default '';
alter table public.assessment_results
  alter column publication_status set default 'draft';

drop policy if exists "assessment_results_read_by_link_or_assignment" on public.assessment_results;
create policy "assessment_results_read_by_link_or_assignment" on public.assessment_results
  for select to authenticated using (
    public.current_school_role() = 'school_admin'
    or exists (
      select 1 from public.students s
      where s.id = assessment_results.student_id
        and (
          (publication_status = 'published' and (
            s.user_id = auth.uid()
            or exists (select 1 from public.parent_student_links psl where psl.student_id = s.id and psl.parent_id = auth.uid())
          ))
          or (public.current_school_role() = 'teacher' and exists (
            select 1 from public.teaching_assignments ta
            join public.school_classes sc on sc.id = ta.class_id
            where ta.teacher_id = auth.uid()
              and ta.subject_id = assessment_results.subject_id
              and sc.name = s.class_name
              and (
                (publication_status in ('draft', 'needs_revision') and recorded_by = auth.uid())
                or publication_status = 'published'
              )
          ))
        )
    )
  );

drop policy if exists "assessment_results_insert_by_assigned_teacher_or_admin" on public.assessment_results;
create policy "assessment_results_insert_by_assigned_teacher_or_admin" on public.assessment_results
  for insert to authenticated with check (
    public.current_school_role() = 'school_admin'
    or (
      recorded_by = auth.uid()
      and public.current_school_role() = 'teacher'
      and publication_status = 'draft'
      and reviewed_by is null
      and exists (
        select 1 from public.students s
        join public.teaching_assignments ta on ta.teacher_id = auth.uid() and ta.subject_id = assessment_results.subject_id
        join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
        where s.id = assessment_results.student_id
      )
    )
  );

drop policy if exists "assessment_results_update_by_assigned_teacher_or_admin" on public.assessment_results;
create policy "assessment_results_update_by_assigned_teacher_or_admin" on public.assessment_results
  for update to authenticated
  using (
    public.current_school_role() = 'school_admin'
    or (
      recorded_by = auth.uid()
      and publication_status in ('draft', 'needs_revision')
      and exists (
        select 1 from public.students s
        join public.teaching_assignments ta on ta.teacher_id = auth.uid() and ta.subject_id = assessment_results.subject_id
        join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
        where s.id = assessment_results.student_id
      )
    )
  )
  with check (
    public.current_school_role() = 'school_admin'
    or (
      recorded_by = auth.uid()
      and public.current_school_role() = 'teacher'
      and publication_status = 'draft'
      and reviewed_by is null
      and reviewed_at is null
      and review_note = ''
      and exists (
        select 1 from public.students s
        join public.teaching_assignments ta on ta.teacher_id = auth.uid() and ta.subject_id = assessment_results.subject_id
        join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
        where s.id = assessment_results.student_id
      )
    )
  );

create or replace function public.review_assessment_result(p_result_id uuid, p_action text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result_row public.assessment_results%rowtype;
  clean_note text := trim(coalesce(p_note, ''));
  next_status text;
begin
  if public.current_school_role() is distinct from 'school_admin' then
    raise exception 'Only school administrators can review assessment results.' using errcode = '42501';
  end if;
  if p_action not in ('publish', 'request_changes') then
    raise exception 'Choose publish or request changes.' using errcode = '22023';
  end if;
  if p_action = 'request_changes' and length(clean_note) < 10 then
    raise exception 'Provide at least 10 characters explaining the requested changes.' using errcode = '22023';
  end if;

  select * into result_row from public.assessment_results where id = p_result_id for update;
  if not found then
    raise exception 'Assessment result not found.' using errcode = 'P0002';
  end if;
  if result_row.publication_status = 'published' then
    raise exception 'Published results cannot be changed from this review screen.' using errcode = 'P0001';
  end if;

  next_status := case when p_action = 'publish' then 'published' else 'needs_revision' end;
  update public.assessment_results
     set publication_status = next_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = clean_note,
         updated_at = now()
   where id = p_result_id;

  return jsonb_build_object('id', p_result_id, 'publicationStatus', next_status, 'reviewedAt', now(), 'reviewNote', clean_note);
end;
$$;

revoke all on function public.review_assessment_result(uuid, text, text) from public;
grant execute on function public.review_assessment_result(uuid, text, text) to authenticated;
