-- Payment tracking + Sanguine payroll config
-- Run in Supabase SQL Editor

-- Payment fields on invoices
ALTER TABLE public.firm_invoices
  ADD COLUMN IF NOT EXISTS payment_received numeric,
  ADD COLUMN IF NOT EXISTS payment_interest_rate numeric DEFAULT 0;

-- Sanguine payroll rate per closed case on firms
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS sanguine_rate_per_closed_case numeric DEFAULT 0;

-- Set $250/closed case for both firms
UPDATE public.firms SET sanguine_rate_per_closed_case = 250 WHERE slug IN ('mca', 'lhp');

-- LHP INV-1 — $35k payment, 3% interest
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order, payment_received, payment_interest_rate)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-01-01', '2026-12-31', 1, 35000, 0.03
FROM public.firms f WHERE f.slug = 'lhp'
ON CONFLICT (firm_id, code) DO UPDATE SET
  payment_received = 35000,
  payment_interest_rate = 0.03,
  period_start = '2026-01-01',
  period_end = '2026-12-31',
  sort_order = 1;
