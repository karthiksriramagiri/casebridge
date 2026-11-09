-- The Reporting Center's own tables.
--
-- Revenue, advertising and worker cost already have homes: firm_invoices,
-- the Meta accounts, and the Team Center's time entries and signed cases.
-- What the Financial Center has never had is the other half of the P&L —
-- the operating expenses — and anything to judge the result against.
--
-- Four things live here:
--
--   operating_expenses   software, contractors, admin and the rest, each with
--                        the period it covers and how it is split between
--                        firms
--   expense_audit_log    who changed what. An expense moves profit, so a
--                        changed figure has to be answerable for
--   reporting_targets    the revenue the company is working to, by period
--   earnout_config       the contractual calculation, which is deliberately
--                        not operating profit
--
-- Money is stored in integer cents everywhere. A dollar column invites a
-- float, and a float invites a report whose parts do not add up to its total.

create table if not exists public.operating_expenses (
  id            uuid primary key default gen_random_uuid(),
  expense_date  date not null,
  /* The period the cost actually covers, which is not always when it was
     paid: an annual licence bought in January is earned across the year.
     Recognition is straight-line across these dates, so a one-time cost
     simply sets both to the expense date. */
  service_start date not null,
  service_end   date not null,
  description   text not null default '',
  vendor        text not null default '',
  -- software | creative | administrative | contractor | other
  category      text not null default 'other',
  amount_cents  bigint not null,
  -- one_time | monthly
  recurrence    text not null default 'one_time',
  /* How the cost reaches a firm:
       direct       all of it to one firm
       even         split equally between the firms named
       revenue      split by each firm's recognised revenue in the period
       unallocated  a company cost that belongs to no firm */
  allocation    text not null default 'unallocated',
  firm_ids      text[] not null default '{}',
  -- posted | pending | void
  status        text not null default 'posted',
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  created_by    text not null default '',
  updated_at    timestamptz not null default now(),
  updated_by    text not null default ''
);

create index if not exists operating_expenses_service_idx
  on public.operating_expenses (service_start, service_end);
create index if not exists operating_expenses_status_idx
  on public.operating_expenses (status);

create table if not exists public.expense_audit_log (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  -- create | update | delete
  action     text not null,
  at         timestamptz not null default now(),
  by_user    text not null default '',
  summary    text not null default '',
  -- [{ field, from, to }]
  changes    jsonb not null default '[]'::jsonb
);

create index if not exists expense_audit_log_expense_idx
  on public.expense_audit_log (expense_id, at desc);

-- One row. The company's revenue targets, in cents, by period.
create table if not exists public.reporting_targets (
  id            int primary key default 1,
  daily_cents     bigint not null default 0,
  weekly_cents    bigint not null default 0,
  monthly_cents   bigint not null default 0,
  quarterly_cents bigint not null default 0,
  annual_cents    bigint not null default 0,
  /* Per-firm monthly targets, keyed by firm id. Kept as json because the
     set of firms changes and a column per firm would not survive it. */
  firm_monthly  jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    text not null default '',
  constraint reporting_targets_single_row check (id = 1)
);

-- One row. The earn-out is a contract, not an accounting policy, so what it
-- deducts is configured rather than assumed.
create table if not exists public.earnout_config (
  id                  int primary key default 1,
  agreement_reference text not null default '',
  deduct_advertising  boolean not null default true,
  deduct_intake       boolean not null default true,
  deduct_unallocated  boolean not null default false,
  -- which opex categories count against the metric
  eligible_categories text[] not null default '{}',
  -- basis points, so 1000 = 10%
  rate_bps            int not null default 0,
  updated_at          timestamptz not null default now(),
  updated_by          text not null default '',
  constraint earnout_config_single_row check (id = 1)
);
