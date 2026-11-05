-- Financial Center rebuild.
--
-- Three things the old model could not answer:
--   1. What revenue did we actually bill? (it was inferred from signed cases)
--   2. What did we actually pay the reps? (worker_pay_rates is empty, so every
--      salary line read $0 while people were being paid)
--   3. What is the margin on one invoice? (costs only existed company-wide)
--
-- Revenue now lives on the invoice: creating one books its amount. Rep pay is
-- entered per person per month as the cheque that was actually written, and is
-- spread across invoices by how much of that month each invoice covers.

-- ── Revenue on the invoice ──────────────────────────────────────────────────
alter table public.firm_invoices
  add column if not exists revenue_amount numeric(12,2);

comment on column public.firm_invoices.revenue_amount is
  'What this invoice bills. Creating an invoice books this as revenue, dated into its period.';

-- ── What the reps were actually paid ────────────────────────────────────────
create table if not exists public.rep_paychecks (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  rep_name   text,
  month      date not null,            -- any day in the month; first is stored
  amount     numeric(12,2) not null,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.rep_paychecks is
  'Monthly cheque per rep. The worker-cost half of the margin, allocated to invoices by period overlap.';

create unique index if not exists rep_paychecks_unique
  on public.rep_paychecks (profile_id, month);
create index if not exists rep_paychecks_month_idx
  on public.rep_paychecks (month desc);

alter table public.rep_paychecks enable row level security;

-- ── Backfill: carry any already-entered manual revenue onto its invoice ─────
-- finance_revenue was the previous step toward the same goal. Nothing is
-- dropped; rows that name an invoice simply seed revenue_amount so the number
-- is not re-keyed by hand.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'finance_revenue') then
    update public.firm_invoices fi
       set revenue_amount = coalesce(fi.revenue_amount, agg.total)
      from (select firm_id, invoice_code, sum(amount) as total
              from public.finance_revenue
             where invoice_code is not null
             group by firm_id, invoice_code) agg
     where fi.firm_id = agg.firm_id
       and fi.code = agg.invoice_code
       and fi.revenue_amount is null;
  end if;
end $$;

-- Invoices that were already paid but never given an amount: the payment is
-- the best available statement of what they billed.
update public.firm_invoices
   set revenue_amount = payment_received
 where revenue_amount is null
   and payment_received is not null
   and payment_received > 0;
