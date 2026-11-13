-- Allow authenticated school administrators to link an existing parent Auth
-- account to a student by email without exposing auth.users to the browser.

create or replace function public.link_parent_to_student(p_parent_email text, p_student_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_parent_id uuid;
  v_parent_name text;
begin
  if public.current_school_role() is distinct from 'school_admin' then
    raise exception 'Only school administrators can link parent accounts.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student record was not found.' using errcode = 'P0002';
  end if;

  select u.id, p.full_name
    into v_parent_id, v_parent_name
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_parent_email))
     and p.role = 'parent'
   limit 1;

  if v_parent_id is null then
    raise exception 'No parent account with that email was found. Create the account and set its role to parent first.' using errcode = 'P0002';
  end if;

  insert into public.parent_student_links (parent_id, student_id)
  values (v_parent_id, p_student_id)
  on conflict (parent_id, student_id) do nothing;

  return jsonb_build_object('parentName', v_parent_name);
end;
$$;

revoke all on function public.link_parent_to_student(text, text) from public;
grant execute on function public.link_parent_to_student(text, text) to authenticated;
