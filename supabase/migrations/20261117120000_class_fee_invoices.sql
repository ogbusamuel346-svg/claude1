-- Issue an itemized invoice to every active student in a class in one transaction.
-- Invoked with the caller's Supabase JWT so existing finance RLS policies apply.
create or replace function public.create_class_fee_invoices(
  p_class_name text,
  p_title text,
  p_session text,
  p_term text,
  p_amount numeric,
  p_due_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  created_count integer;
begin
  if public.current_school_role() not in ('school_admin', 'bursar') then
    raise exception 'Only school administrators and bursars can issue class invoices.' using errcode = '42501';
  end if;
  if p_class_name is null or length(trim(p_class_name)) = 0
    or p_title is null or length(trim(p_title)) = 0 or length(trim(p_title)) > 120
    or p_session is null or length(trim(p_session)) = 0 or length(trim(p_session)) > 40
    or p_term is null or length(trim(p_term)) = 0 or length(trim(p_term)) > 40
    or p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'Provide a class, fee title, session, term, and positive valid amount.' using errcode = '22023';
  end if;

  insert into public.fee_invoices (invoice_number, student_id, title, school_session, term, amount, due_date, created_by)
  select 'INV-' || upper(replace(gen_random_uuid()::text, '-', '')),
    s.id, trim(p_title), trim(p_session), trim(p_term), p_amount, p_due_date, auth.uid()
  from public.students s
  where s.class_name = trim(p_class_name) and s.status <> 'Archived';
  get diagnostics created_count = row_count;
  if created_count = 0 then
    raise exception 'No active students were found in %.', trim(p_class_name) using errcode = 'P0002';
  end if;
  return jsonb_build_object('created', created_count, 'className', trim(p_class_name));
end;
$$;

revoke all on function public.create_class_fee_invoices(text, text, text, text, numeric, date) from public;
grant execute on function public.create_class_fee_invoices(text, text, text, text, numeric, date) to authenticated;

