-- Give administrators a human-readable identity for existing Auth profiles.
alter table public.profiles
  add column if not exists email text;

update public.profiles p
   set email = u.email,
       full_name = case
         when coalesce(trim(p.full_name), '') = '' then coalesce(u.raw_user_meta_data ->> 'full_name', '')
         else p.full_name
       end
  from auth.users u
 where u.id = p.id
   and (p.email is distinct from u.email or coalesce(trim(p.full_name), '') = '');

create or replace function public.create_school_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles as current_profile (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'student'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when coalesce(trim(current_profile.full_name), '') = '' then excluded.full_name
          else current_profile.full_name
        end;
  return new;
end;
$$;

drop trigger if exists create_school_profile_after_signup on auth.users;
create trigger create_school_profile_after_signup
  after insert or update on auth.users
  for each row execute procedure public.create_school_profile_for_auth_user();
