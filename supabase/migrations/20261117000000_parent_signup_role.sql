-- Allow public parent signup while keeping all other requested roles restricted.
-- Existing school profiles keep their stored role on Auth user updates.
create or replace function public.create_school_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  requested_role text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'requested_role' in ('teacher', 'parent')
      then new.raw_user_meta_data ->> 'requested_role'
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
