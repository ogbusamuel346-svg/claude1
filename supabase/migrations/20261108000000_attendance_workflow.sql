-- Daily class attendance. Teachers can write only for assigned classes;
-- students and linked parents can read only linked attendance rows.

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('Present', 'Absent', 'Late', 'Excused')),
  notes text not null default '',
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, attendance_date)
);

create index if not exists attendance_records_date_idx on public.attendance_records(attendance_date desc);
create index if not exists attendance_records_student_date_idx on public.attendance_records(student_id, attendance_date desc);

alter table public.attendance_records enable row level security;
grant select, insert, update on public.attendance_records to authenticated;

create policy "attendance_read_by_link_or_assignment" on public.attendance_records
  for select to authenticated using (
    public.current_school_role() = 'school_admin'
    or exists (
      select 1 from public.students s
      where s.id = attendance_records.student_id
        and (s.user_id = auth.uid()
          or exists (select 1 from public.parent_student_links psl where psl.student_id = s.id and psl.parent_id = auth.uid())
          or exists (
            select 1 from public.teaching_assignments ta
            join public.school_classes sc on sc.id = ta.class_id
            where ta.teacher_id = auth.uid() and sc.name = s.class_name
          ))
    )
  );

create policy "attendance_insert_by_assigned_teacher_or_admin" on public.attendance_records
  for insert to authenticated with check (
    public.current_school_role() = 'school_admin'
    or (recorded_by = auth.uid() and public.current_school_role() = 'teacher' and exists (
      select 1 from public.students s
      join public.teaching_assignments ta on ta.teacher_id = auth.uid()
      join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
      where s.id = attendance_records.student_id
    ))
  );

create policy "attendance_update_by_assigned_teacher_or_admin" on public.attendance_records
  for update to authenticated
  using (
    public.current_school_role() = 'school_admin'
    or (recorded_by = auth.uid() and exists (
      select 1 from public.students s
      join public.teaching_assignments ta on ta.teacher_id = auth.uid()
      join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
      where s.id = attendance_records.student_id
    ))
  )
  with check (
    public.current_school_role() = 'school_admin'
    or (recorded_by = auth.uid() and public.current_school_role() = 'teacher' and exists (
      select 1 from public.students s
      join public.teaching_assignments ta on ta.teacher_id = auth.uid()
      join public.school_classes sc on sc.id = ta.class_id and sc.name = s.class_name
      where s.id = attendance_records.student_id
    ))
  );

do $$
begin
  alter publication supabase_realtime add table public.attendance_records;
exception when duplicate_object then null;
         when undefined_object then raise notice 'supabase_realtime publication is unavailable; enable it before subscribing to attendance.';
end;
$$;
