-- Fee invoicing and cashier-recorded payments. Payment rows are immutable and
-- a SECURITY DEFINER RPC serializes balance checks to prevent overpayment races.

create table if not exists public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  student_id text not null references public.students(id) on delete restrict,
  title text not null,
  school_session text not null,
  term text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.fee_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'pos', 'other')),
  reference text unique,
  note text not null default '',
  received_by uuid not null references public.profiles(id),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fee_invoices_student_idx on public.fee_invoices(student_id, created_at desc);
create index if not exists fee_payments_invoice_idx on public.fee_payments(invoice_id, paid_at desc);

alter table public.fee_invoices enable row level security;
alter table public.fee_payments enable row level security;
drop policy if exists "students_read_linked_or_assigned" on public.students;
create policy "students_read_linked_or_assigned" on public.students
  for select to authenticated using (
    public.current_school_role() in ('school_admin', 'bursar')
    or user_id = auth.uid()
    or exists (select 1 from public.parent_student_links psl where psl.student_id = id and psl.parent_id = auth.uid())
    or exists (
      select 1 from public.teaching_assignments ta
      join public.school_classes sc on sc.id = ta.class_id
      where ta.teacher_id = auth.uid() and sc.name = class_name
    )
  );
grant select on public.fee_invoices, public.fee_payments to authenticated;
grant insert on public.fee_invoices to authenticated;
drop policy if exists "school_settings_read_authenticated" on public.school_settings;
create policy "school_settings_read_authenticated" on public.school_settings
  for select to authenticated using (true);

create policy "fee_invoices_read_by_role_or_link" on public.fee_invoices
  for select to authenticated using (
    public.current_school_role() in ('school_admin', 'bursar')
    or exists (
      select 1 from public.students s
      where s.id = fee_invoices.student_id
        and (s.user_id = auth.uid()
          or exists (select 1 from public.parent_student_links psl where psl.student_id = s.id and psl.parent_id = auth.uid()))
    )
  );

create policy "fee_invoices_insert_finance_staff" on public.fee_invoices
  for insert to authenticated with check (
    created_by = auth.uid()
    and public.current_school_role() in ('school_admin', 'bursar')
    and exists (select 1 from public.students s where s.id = fee_invoices.student_id and s.status <> 'Archived')
  );

create policy "fee_payments_read_via_invoice" on public.fee_payments
  for select to authenticated using (
    exists (select 1 from public.fee_invoices i where i.id = fee_payments.invoice_id)
  );

create or replace function public.record_fee_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invoice_row public.fee_invoices%rowtype;
  paid_total numeric(12,2);
  remaining numeric(12,2);
  payment_id uuid;
  clean_reference text := nullif(trim(coalesce(p_reference, '')), '');
  clean_note text := trim(coalesce(p_note, ''));
begin
  if public.current_school_role() not in ('school_admin', 'bursar') then
    raise exception 'Only school administrators and bursars can record fee payments.' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'bank_transfer', 'pos', 'other') then
    raise exception 'Choose a valid payment method.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = '22023';
  end if;
  if length(coalesce(p_reference, '')) > 100 or length(clean_note) > 300 then
    raise exception 'Reference or note is too long.' using errcode = '22023';
  end if;

  select * into invoice_row from public.fee_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount), 0) into paid_total
    from public.fee_payments where invoice_id = p_invoice_id;
  remaining := invoice_row.amount - paid_total;
  if p_amount > remaining then
    raise exception 'Payment exceeds the remaining invoice balance.' using errcode = '22023';
  end if;

  insert into public.fee_payments (invoice_id, amount, method, reference, note, received_by)
  values (p_invoice_id, p_amount, p_method, clean_reference, clean_note, auth.uid())
  returning id into payment_id;

  return jsonb_build_object(
    'paymentId', payment_id,
    'invoiceId', p_invoice_id,
    'paidTotal', paid_total + p_amount,
    'balance', remaining - p_amount
  );
end;
$$;

revoke all on function public.record_fee_payment(uuid, numeric, text, text, text) from public;
grant execute on function public.record_fee_payment(uuid, numeric, text, text, text) to authenticated;
