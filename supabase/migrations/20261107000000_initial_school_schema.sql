-- Northstar's Supabase foundation: Auth profiles, school setup, student records,
-- row-level access policies, private document storage, and student record realtime.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student'
    check (role in ('school_admin', 'teacher', 'student', 'parent', 'bursar', 'librarian')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Northstar Academy',
  current_session text not null default '2026/2027',
  current_term text not null default 'First term',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id text primary key,
  admission_number text not null unique,
  user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  class_name text not null references public.school_classes(name),
  guardian_name text not null default 'Not provided',
  status text not null default 'Active'
    check (status in ('Active', 'Pending', 'Withdrawn', 'Archived')),
  date_of_birth date,
  gender text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_student_links (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  relationship text not null default 'Parent / guardian',
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

create table if not exists public.teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.school_classes(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id, subject_id)
);

create index if not exists students_class_status_idx on public.students(class_name, status);
create index if not exists students_created_at_idx on public.students(created_at desc);
create index if not exists parent_student_links_student_idx on public.parent_student_links(student_id);
create index if not exists teaching_assignments_teacher_idx on public.teaching_assignments(teacher_id);

insert into public.school_settings (id, name, current_session, current_term)
values (1, 'Northstar Academy', '2026/2027', 'First term')
on conflict (id) do nothing;

insert into public.school_classes (name, sort_order)
values ('JSS 1A',10), ('JSS 1B',11), ('JSS 2A',20), ('JSS 2B',21), ('JSS 3A',30),
       ('SSS 1A',40), ('SSS 1B',41), ('SSS 2A',50), ('SSS 3A',60)
on conflict (name) do nothing;

insert into public.subjects (name, code)
values ('Mathematics','MTH'), ('English Language','ENG'), ('Basic Science','BSC'),
       ('Social Studies','SST'), ('Civic Education','CIV'), ('Computer Studies','CST')
on conflict (name) do nothing;

create or replace function public.current_school_role()
returns text
language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

revoke all on function public.current_school_role() from public;
grant execute on function public.current_school_role() to authenticated;

create or replace function public.create_school_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_school_profile_after_signup on auth.users;
create trigger create_school_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_school_profile_for_auth_user();

alter table public.profiles enable row level security;
alter table public.school_settings enable row level security;
alter table public.school_classes enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.teaching_assignments enable row level security;

create policy "profiles_read_self_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_school_role() = 'school_admin');

create policy "school_settings_read_authenticated" on public.school_settings
  for select to authenticated using (true);
create policy "school_settings_admin_manage" on public.school_settings
  for all to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

create policy "classes_read_by_school_role" on public.school_classes
  for select to authenticated using (
    public.current_school_role() = 'school_admin'
    or exists (select 1 from public.teaching_assignments ta where ta.class_id = school_classes.id and ta.teacher_id = auth.uid())
  );
create policy "classes_admin_manage" on public.school_classes
  for all to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

create policy "subjects_read_by_school_role" on public.subjects
  for select to authenticated using (
    public.current_school_role() = 'school_admin'
    or exists (select 1 from public.teaching_assignments ta where ta.subject_id = subjects.id and ta.teacher_id = auth.uid())
  );
create policy "subjects_admin_manage" on public.subjects
  for all to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

create policy "students_read_linked_or_assigned" on public.students
  for select to authenticated using (
    public.current_school_role() = 'school_admin'
    or user_id = auth.uid()
    or exists (select 1 from public.parent_student_links psl where psl.student_id = id and psl.parent_id = auth.uid())
    or exists (
      select 1 from public.teaching_assignments ta
      join public.school_classes sc on sc.id = ta.class_id
      where ta.teacher_id = auth.uid() and sc.name = class_name
    )
  );
create policy "students_admin_insert" on public.students
  for insert to authenticated with check (public.current_school_role() = 'school_admin');
create policy "students_admin_update" on public.students
  for update to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

create policy "parent_links_read_self_or_admin" on public.parent_student_links
  for select to authenticated using (parent_id = auth.uid() or public.current_school_role() = 'school_admin');
create policy "parent_links_admin_manage" on public.parent_student_links
  for all to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

create policy "teaching_assignments_read_self_or_admin" on public.teaching_assignments
  for select to authenticated using (teacher_id = auth.uid() or public.current_school_role() = 'school_admin');
create policy "teaching_assignments_admin_manage" on public.teaching_assignments
  for all to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-documents', 'school-documents', false, 10485760,
        array['image/jpeg','image/png','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "school_documents_read_own_or_admin" on storage.objects
  for select to authenticated using (
    bucket_id = 'school-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.current_school_role() = 'school_admin')
  );
create policy "school_documents_upload_own_or_admin" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'school-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.current_school_role() = 'school_admin')
  );
create policy "school_documents_update_own_or_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'school-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.current_school_role() = 'school_admin'))
  with check (bucket_id = 'school-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.current_school_role() = 'school_admin'));
create policy "school_documents_delete_admin_only" on storage.objects
  for delete to authenticated using (bucket_id = 'school-documents' and public.current_school_role() = 'school_admin');

do $$
begin
  alter publication supabase_realtime add table public.students;
exception when duplicate_object then null;
         when undefined_object then raise notice 'supabase_realtime publication is unavailable; enable it in the Supabase project before subscribing.';
end;
$$;
