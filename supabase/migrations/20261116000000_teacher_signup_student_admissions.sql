-- Allow public self-signup to request only the Teacher role and add a private
-- admissions queue for new student applications.
create or replace function public.create_school_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'requested_role' in ('teacher', 'parent') then new.raw_user_meta_data ->> 'requested_role'
    else 'student'
  end;

  insert into public.profiles as current_profile (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, requested_role)
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when coalesce(trim(current_profile.full_name), '') = '' then excluded.full_name
          else current_profile.full_name
        end;
  return new;
end;
$$;

create table if not exists public.student_applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  student_full_name text not null check (length(trim(student_full_name)) between 2 and 160),
  date_of_birth date,
  gender text check (gender is null or gender in ('Female', 'Male', 'Prefer not to say')),
  requested_class text not null references public.school_classes(name),
  guardian_name text not null check (length(trim(guardian_name)) between 2 and 160),
  guardian_email text not null,
  guardian_phone text not null,
  address text not null,
  previous_school text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  student_id text unique references public.students(id) on delete set null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists student_applications_status_created_idx
  on public.student_applications(status, created_at desc);

alter table public.student_applications enable row level security;
grant insert on public.student_applications to anon;
grant select, update on public.student_applications to authenticated;

drop policy if exists "student_applications_public_submit" on public.student_applications;
create policy "student_applications_public_submit" on public.student_applications
  for insert to anon with check (
    status = 'pending'
    and review_note = ''
    and reviewed_by is null
    and reviewed_at is null
    and student_id is null
  );

drop policy if exists "student_applications_admin_read" on public.student_applications;
create policy "student_applications_admin_read" on public.student_applications
  for select to authenticated using (public.current_school_role() = 'school_admin');

drop policy if exists "student_applications_admin_update" on public.student_applications;
create policy "student_applications_admin_update" on public.student_applications
  for update to authenticated
  using (public.current_school_role() = 'school_admin')
  with check (public.current_school_role() = 'school_admin');

drop policy if exists "classes_public_read_for_admissions" on public.school_classes;
create policy "classes_public_read_for_admissions" on public.school_classes
  for select to anon using (archived_at is null);
grant select on public.school_classes to anon;

create or replace function public.approve_student_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  application_row public.student_applications%rowtype;
  student_row public.students%rowtype;
  suffix text;
begin
  if public.current_school_role() is distinct from 'school_admin' then
    raise exception 'Only school administrators can approve student applications.' using errcode = '42501';
  end if;

  select * into application_row
    from public.student_applications
   where id = p_application_id
   for update;
  if not found then
    raise exception 'Student application was not found.' using errcode = 'P0002';
  end if;
  if application_row.status = 'approved' and application_row.student_id is not null then
    select * into student_row from public.students where id = application_row.student_id;
    return jsonb_build_object('student', to_jsonb(student_row), 'alreadyApproved', true);
  end if;
  if application_row.status <> 'pending' then
    raise exception 'Only pending student applications can be approved.' using errcode = '22023';
  end if;

  suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.students (
    id, admission_number, full_name, class_name, guardian_name,
    status, date_of_birth, gender, address
  ) values (
    'STU-' || suffix, 'ADM-' || suffix, application_row.student_full_name,
    application_row.requested_class, application_row.guardian_name,
    'Active', application_row.date_of_birth, application_row.gender,
    application_row.address
  ) returning * into student_row;

  update public.student_applications
     set status = 'approved', student_id = student_row.id,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = ''
   where id = application_row.id;

  return jsonb_build_object('student', to_jsonb(student_row), 'alreadyApproved', false);
end;
$$;

revoke all on function public.approve_student_application(uuid) from public;
grant execute on function public.approve_student_application(uuid) to authenticated;

create or replace function public.reject_student_application(p_application_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_school_role() is distinct from 'school_admin' then
    raise exception 'Only school administrators can reject student applications.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 or length(p_note) > 500 then
    raise exception 'Provide a rejection note between 5 and 500 characters.' using errcode = '22023';
  end if;

  update public.student_applications
     set status = 'rejected', review_note = trim(p_note),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_application_id and status = 'pending';
  if not found then
    raise exception 'Pending student application was not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('rejected', true);
end;
$$;

revoke all on function public.reject_student_application(uuid, text) from public;
grant execute on function public.reject_student_application(uuid, text) to authenticated;
