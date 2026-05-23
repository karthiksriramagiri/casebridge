-- ============================================================
-- MCA Signed Cases + Ops Expenses seed data
-- Run AFTER all three migration files have been applied
-- ============================================================

-- ============ 19 Signed Cases ============
INSERT INTO public.ghl_leads (firm_id, contact_name, invoice_code, case_status, qualified_at)
SELECT f.id, v.contact_name, v.invoice_code, 'e_signed', v.qualified_at::timestamptz
FROM public.firms f
CROSS JOIN (VALUES
  -- INV-1 (2026-02-28 → 2026-03-18, 5 cases)
  ('Tameka Mouzon',    'INV-1', '2026-03-01'),
  ('Randall Yaughn',   'INV-1', '2026-03-05'),
  ('Monica Little',    'INV-1', '2026-03-08'),
  ('Lauren Brown',     'INV-1', '2026-03-12'),
  ('Cynthia Steward',  'INV-1', '2026-03-17'),
  -- INV-2 (2026-03-19 → 2026-04-12, 10 cases)
  ('Mariejo Johnson',  'INV-2', '2026-03-20'),
  ('Alexis Wilson',    'INV-2', '2026-03-23'),
  ('Ernest Miller Jr', 'INV-2', '2026-03-26'),
  ('Kimora Jenkins',   'INV-2', '2026-03-28'),
  ('Tylique Prescott', 'INV-2', '2026-03-31'),
  ('Stephen Asomah',   'INV-2', '2026-04-02'),
  ('Danielle Wright',  'INV-2', '2026-04-04'),
  ('Darrell Mintz',    'INV-2', '2026-04-07'),
  ('Derrick Gibson',   'INV-2', '2026-04-09'),
  ('Justin Adams',     'INV-2', '2026-04-11'),
  -- INV-3 (2026-04-13 → present, 4 cases so far)
  ('Jason Gaskin',     'INV-3', '2026-04-14'),
  ('Myron Sims',       'INV-3', '2026-04-14'),
  ('Crystal Post',     'INV-3', '2026-04-15'),
  ('Gary Lovingood',   'INV-3', '2026-04-16')
) AS v(contact_name, invoice_code, qualified_at)
WHERE f.slug = 'mca'
ON CONFLICT DO NOTHING;

-- ============ 16 Ops Expenses ============
-- FB Ad Spend is excluded (comes live from Meta API)
-- invoice_code will be backfilled by migration_firm_invoice_periods.sql if run after this
INSERT INTO public.ops_expenses (firm_id, date, amount, description, category)
SELECT f.id, v.date::date, v.amount, v.description, v.category
FROM public.firms f
CROSS JOIN (VALUES
  -- INV-1 expenses
  ('2026-03-01', 350.00,  'Paralegal hours - intake review',      'labor'),
  ('2026-03-05', 120.00,  'DocuSign monthly plan',                'software'),
  ('2026-03-08', 200.00,  'GHL subscription',                     'software'),
  ('2026-03-10', 180.00,  'Virtual office / phone line',          'overhead'),
  ('2026-03-15', 95.00,   'Loom + Slack tools',                   'software'),
  -- INV-2 expenses
  ('2026-03-20', 350.00,  'Paralegal hours - intake review',      'labor'),
  ('2026-03-22', 250.00,  'Case management software',             'software'),
  ('2026-03-25', 120.00,  'DocuSign monthly plan',                'software'),
  ('2026-03-28', 200.00,  'GHL subscription',                     'software'),
  ('2026-04-01', 180.00,  'Virtual office / phone line',          'overhead'),
  ('2026-04-05', 95.00,   'Loom + Slack tools',                   'software'),
  ('2026-04-08', 400.00,  'Paralegal hours - settlement follow',  'labor'),
  -- INV-3 expenses (so far)
  ('2026-04-13', 350.00,  'Paralegal hours - intake review',      'labor'),
  ('2026-04-14', 120.00,  'DocuSign monthly plan',                'software'),
  ('2026-04-15', 200.00,  'GHL subscription',                     'software'),
  ('2026-04-16', 180.00,  'Virtual office / phone line',          'overhead')
) AS v(date, amount, description, category)
WHERE f.slug = 'mca'
ON CONFLICT DO NOTHING;

-- Backfill invoice_code on expenses based on date ranges
UPDATE public.ops_expenses e
SET invoice_code = fi.code
FROM public.firm_invoices fi
JOIN public.firms f ON f.id = fi.firm_id AND f.slug = 'mca'
WHERE e.invoice_code IS NULL
  AND e.date BETWEEN fi.period_start AND fi.period_end
  AND (e.firm_id IS NULL OR e.firm_id = f.id);
