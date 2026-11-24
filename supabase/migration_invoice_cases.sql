-- Case delivery against an invoice, case by case.
--
-- An invoice is a commitment: a firm is billed for a number of cases over a
-- period. Until now the report could say what was billed but not how much of
-- it had been delivered, so nothing could answer the only question anyone
-- asks mid-period — will this invoice finish, and when.
--
-- The counts cannot come from ghl_leads. Its invoice_code tagging disagrees
-- with the firms' own case management workbooks in both directions: 120
-- against LHP's INV-9 where the workbook has 90, 19 against J&M's INV-4 where
-- the workbook has 46. The workbook is what the firm is invoiced from, so the
-- workbook is what this table holds.
--
-- One row per case per invoice, imported from the workbooks by
-- scripts/import-case-workbooks.py. Rows, not a count, because the completion
-- date is the sign-up date of the case that fills the order — a total cannot
-- say when it was reached.

create table if not exists public.invoice_cases (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,

  -- Canonical, without spaces: INV-9. The workbooks write the live sheet
  -- "INV - 9" and the closed ones "INV-8", and firm_invoices.code follows
  -- whatever was typed, so every join normalises rather than trusting it.
  invoice_code text not null,

  full_name text,
  phone text,
  email text,
  date_of_loss date,

  -- The day the case signed. This is the delivery date, and the Nth of them
  -- is the invoice's completion date.
  signed_on date not null,
  days_until_closed integer,

  -- e_signed | replacement | disqualified. A replacement is a case swapped
  -- for another, not a case delivered, and does not count toward the order —
  -- the same rule the rest of the Financial Center already applies.
  status text not null default 'e_signed',

  firm_notes text,
  casebridge_notes text,

  -- Where in the sheet the row sat, so an import can be read back against it.
  sheet_row integer,
  imported_at timestamptz not null default now()
);

create index if not exists invoice_cases_firm_code_idx
  on public.invoice_cases (firm_id, invoice_code);

create index if not exists invoice_cases_signed_idx
  on public.invoice_cases (signed_on);

comment on table public.invoice_cases is
  'Cases delivered against an invoice, imported from the firm case management workbooks. One row per case; status=replacement does not count toward the order.';
