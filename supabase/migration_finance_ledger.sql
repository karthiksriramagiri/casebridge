-- ============================================================
-- Company money model — the finance sheet, in the database
--
-- Revenue comes live from Commas and ad spend from Meta, so neither is
-- stored here. These three tables hold what only a person knows: the pay
-- periods the business closes its books on, the lines that never touch an
-- API (referral fees, profit share, payroll, refunds, investments, interest)
-- and the bank balances.
--
-- Seeded from the finance sheet as of 09/14/2026.
-- Run in Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_periods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (period_end)
);

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  -- refund | referral | payroll | profit_share | investment | interest | ops
  category text NOT NULL,
  -- Who the profit share went to, or any other counterparty
  entity text,
  amount numeric NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account text NOT NULL,
  label text,
  amount numeric NOT NULL,
  as_of date NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (account, as_of)
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON public.finance_entries(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_category ON public.finance_entries(category);

-- ── Pay periods, exactly as the sheet closes them ───────────────────────────
INSERT INTO public.finance_periods (label, period_start, period_end) VALUES
  ('February',      '2026-02-01', '2026-02-28'),
  ('March',         '2026-03-01', '2026-03-31'),
  ('April',         '2026-04-01', '2026-04-30'),
  ('May',           '2026-05-01', '2026-05-31'),
  ('June (12)',     '2026-06-01', '2026-06-12'),
  ('June (26)',     '2026-06-13', '2026-06-26'),
  ('July (17)',     '2026-06-27', '2026-07-17'),
  ('July (31)',     '2026-07-18', '2026-07-31'),
  ('August (14)',   '2026-08-01', '2026-08-14'),
  ('August (28)',   '2026-08-15', '2026-08-28'),
  ('September (11)','2026-08-29', '2026-09-11'),
  ('September (25)','2026-09-12', '2026-09-25')
ON CONFLICT (period_end) DO UPDATE SET label = EXCLUDED.label, period_start = EXCLUDED.period_start;

-- ── The hand-kept columns ───────────────────────────────────────────────────
-- Amounts are stored positive; the category decides which way the money moved.
DELETE FROM public.finance_entries WHERE note = 'seed:sheet-2026-09-14';

INSERT INTO public.finance_entries (date, category, entity, amount, note) VALUES
  -- Refunds
  ('2026-04-30', 'refund',       NULL,            20025.00, 'seed:sheet-2026-09-14'),
  ('2026-06-26', 'refund',       NULL,            28000.00, 'seed:sheet-2026-09-14'),
  -- Referral fees
  ('2026-05-31', 'referral',     NULL,             2250.00, 'seed:sheet-2026-09-14'),
  ('2026-06-26', 'referral',     NULL,             7500.00, 'seed:sheet-2026-09-14'),
  ('2026-07-17', 'referral',     NULL,             7500.00, 'seed:sheet-2026-09-14'),
  ('2026-07-31', 'referral',     NULL,            11000.00, 'seed:sheet-2026-09-14'),
  ('2026-08-28', 'referral',     NULL,            15750.00, 'seed:sheet-2026-09-14'),
  -- Payroll
  ('2026-05-31', 'payroll',      NULL,              840.00, 'seed:sheet-2026-09-14'),
  ('2026-06-12', 'payroll',      NULL,              616.35, 'seed:sheet-2026-09-14'),
  ('2026-06-26', 'payroll',      NULL,             2222.67, 'seed:sheet-2026-09-14'),
  ('2026-07-17', 'payroll',      NULL,             1388.78, 'seed:sheet-2026-09-14'),
  ('2026-07-31', 'payroll',      NULL,             2026.00, 'seed:sheet-2026-09-14'),
  ('2026-08-14', 'payroll',      NULL,             5626.75, 'seed:sheet-2026-09-14'),
  ('2026-08-28', 'payroll',      NULL,             1148.75, 'seed:sheet-2026-09-14'),
  ('2026-09-11', 'payroll',      NULL,             3335.97, 'seed:sheet-2026-09-14'),
  -- Profit share
  ('2026-06-26', 'profit_share', 'Hashshop Inc',  10841.07, 'seed:sheet-2026-09-14'),
  ('2026-07-17', 'profit_share', 'Hashshop Inc',  15469.79, 'seed:sheet-2026-09-14'),
  ('2026-07-31', 'profit_share', 'Hashshop Inc',  14166.97, 'seed:sheet-2026-09-14'),
  ('2026-08-14', 'profit_share', 'Hashshop Inc',  14288.95, 'seed:sheet-2026-09-14'),
  ('2026-08-28', 'profit_share', 'Hashshop Inc',  16428.09, 'seed:sheet-2026-09-14'),
  ('2026-09-11', 'profit_share', 'Hashshop Inc',   4465.62, 'seed:sheet-2026-09-14'),
  ('2026-06-26', 'profit_share', 'Nexttide LLC',   4658.57, 'seed:sheet-2026-09-14'),
  ('2026-07-17', 'profit_share', 'Nexttide LLC',   7694.43, 'seed:sheet-2026-09-14'),
  ('2026-07-31', 'profit_share', 'Nexttide LLC',   7083.49, 'seed:sheet-2026-09-14'),
  ('2026-08-14', 'profit_share', 'Nexttide LLC',   7144.47, 'seed:sheet-2026-09-14'),
  ('2026-08-28', 'profit_share', 'Nexttide LLC',   8204.05, 'seed:sheet-2026-09-14'),
  ('2026-09-11', 'profit_share', 'Nexttide LLC',   2222.82, 'seed:sheet-2026-09-14'),
  -- Investments and interest
  ('2026-08-14', 'investment',   NULL,             2381.49, 'seed:sheet-2026-09-14'),
  ('2026-08-28', 'investment',   NULL,             2738.01, 'seed:sheet-2026-09-14'),
  ('2026-09-11', 'investment',   NULL,              744.27, 'seed:sheet-2026-09-14'),
  ('2026-09-11', 'interest',     NULL,              616.38, 'seed:sheet-2026-09-14'),
  -- Ops expenses as the sheet totals them (the ops_expenses table only holds
  -- a fraction of these lines, so the sheet's figure is the one that counts)
  ('2026-02-28', 'ops',          NULL,              332.04, 'seed:sheet-2026-09-14'),
  ('2026-03-31', 'ops',          NULL,              235.92, 'seed:sheet-2026-09-14'),
  ('2026-04-30', 'ops',          NULL,             9937.69, 'seed:sheet-2026-09-14'),
  ('2026-05-31', 'ops',          NULL,             2370.38, 'seed:sheet-2026-09-14'),
  ('2026-06-12', 'ops',          NULL,              333.36, 'seed:sheet-2026-09-14'),
  ('2026-06-26', 'ops',          NULL,             1174.98, 'seed:sheet-2026-09-14'),
  ('2026-07-17', 'ops',          NULL,              957.90, 'seed:sheet-2026-09-14'),
  ('2026-07-31', 'ops',          NULL,             1583.41, 'seed:sheet-2026-09-14'),
  ('2026-08-14', 'ops',          NULL,             3824.90, 'seed:sheet-2026-09-14'),
  ('2026-08-28', 'ops',          NULL,             1538.77, 'seed:sheet-2026-09-14'),
  ('2026-09-11', 'ops',          NULL,             2598.64, 'seed:sheet-2026-09-14');

-- ── Bank balances ───────────────────────────────────────────────────────────
INSERT INTO public.finance_balances (account, label, amount, as_of, note) VALUES
  ('wells_fargo',  'Wells Fargo',      44779.38, '2026-09-14', NULL),
  ('money_market', 'Money market',    263431.64, '2026-09-14', NULL),
  ('dispute',      'In dispute',       18588.03, '2026-09-14', 'Expected money back / received')
ON CONFLICT (account, as_of) DO UPDATE SET
  label = EXCLUDED.label, amount = EXCLUDED.amount, note = EXCLUDED.note;
