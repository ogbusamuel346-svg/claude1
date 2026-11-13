-- Subject assessment scores entered by assigned teachers and visible to the
-- student, linked parent/guardian, and school administrator.

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  school_session text not null,
  term text not null,
  assessment_name text not null,
  score numeric(7,2) not null check (score >= 0),
  max_score numeric(7,2) not null check (max_score > 0 and score <= max_score),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id, school_session, term, assessment_name)
);

create index if not exists assessment_results_student_term_idx
  on public.assessment_results(student_id, school_session, term);
create index if not exists assessment_results_subject_term_idx
  on public.assessment_results(subject_id, school_session, term);

alter table public.assessment_results enable row level security;
grant select, insert, update on public.assessment_results to authenticated;

create policy "subjects_read_with_linked_assessment_result" on public.subjects
  for select to authenticated using (
    public.current_school_role() in ('student', 'parent')
    and exists (
      select 1 from public.assessment_results ar
      join public.students s on s.id = ar.student_id
      where ar.subject_id = subjects.id
        and (s.user_id = auth.uid()
          or exists (select 1 from public.parent_student_links psl where psl.student_id = s.id and psl.parent_id = auth.uid()))
    )
  );

create policy "assessment_results_read_by_link_or_assignment" on public.assessment_results
  for select to authenticated using (
    public.current_school_role() = 'school_admin'
    or exists (
      select 1 from public.students s
      where s.id = assessment_results.student_id
        and (s.user_id = auth.uid()
          or exists (select 1 from public.parent_student_links psl where psl.student_id = s.id and psl.parent_id = auth.uid())
          or exists (
            select 1 from public.teaching_assignments ta
            join public.school_classes sc on sc.id = ta.class_id
            where ta.teacher_id = auth.uid()
              and ta.subject_id = assessment_results.subject_id
              and sc.name = s.class_name
          ))
    )
  );

create policy "assessment_results_insert_by_assigned_teacher_or_admin" on public.assessment_results
  for insert to authenticated with check (
    public.current_school_role() = 'school_admin'
    or (recorded_by = auth.uid() and public.current_school_role() = 'teacher' and exists (
      select 1 from public.students s
      join public.teaching_assignments ta on ta.teacher_id = auth.uid() and ta.subject_id = assessment_results.subject_id
      join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
      where s.id = assessment_results.student_id
    ))
  );

create policy "assessment_results_update_by_assigned_teacher_or_admin" on public.assessment_results
  for update to authenticated
  using (
    public.current_school_role() = 'school_admin'
    or (recorded_by = auth.uid() and exists (
      select 1 from public.students s
      join public.teaching_assignments ta on ta.teacher_id = auth.uid() and ta.subject_id = assessment_results.subject_id
      join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
      where s.id = assessment_results.student_id
    ))
  )
  with check (
    public.current_school_role() = 'school_admin'
    or (recorded_by = auth.uid() and public.current_school_role() = 'teacher' and exists (
      select 1 from public.students s
      join public.teaching_assignments ta on ta.teacher_id = auth.uid() and ta.subject_id = assessment_results.subject_id
      join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
      where s.id = assessment_results.student_id
    ))
  );

do $$
begin
  alter publication supabase_realtime add table public.assessment_results;
exception when duplicate_object then null;
         when undefined_object then raise notice 'supabase_realtime publication is unavailable; enable it before subscribing to results.';
end;
$$;
