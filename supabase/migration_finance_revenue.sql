-- Manual revenue for the Financial Center.
--
-- Revenue used to be inferred: signed cases multiplied by the firm's case
-- value, with real payments overriding it when they existed. That is a model,
-- and it drifts from what the business was actually paid. This table holds
-- what someone actually banked, entered by hand, and becomes the revenue line.
--
-- Nothing is deleted. The modelled figure is still computed and shown beside
-- this one, so the two can be compared rather than silently swapped.

create table if not exists public.finance_revenue (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid references public.firms(id) on delete set null,
  amount      numeric(12,2) not null,
  received_on date not null,
  invoice_code text,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text
);

comment on table public.finance_revenue is
  'Manually entered revenue. The revenue line of the Financial Center.';

create index if not exists finance_revenue_received_on_idx
  on public.finance_revenue (received_on desc);
create index if not exists finance_revenue_firm_idx
  on public.finance_revenue (firm_id);

alter table public.finance_revenue enable row level security;

-- The Financial Center authenticates with its own cookie and reads through the
-- service role, so no anon policy is wanted here: without one, RLS denies
-- everything that is not the service key, which is the intent.
