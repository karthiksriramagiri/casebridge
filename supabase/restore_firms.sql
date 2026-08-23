-- ============================================================
-- Restore firms table data
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Re-insert all firms
INSERT INTO public.firms (name, slug, case_value, phase_initial_max_weekly_spend, phase_scale_max_weekly_spend, meta_account_id, meta_campaign_filter, ghl_location_name, sanguine_rate_per_closed_case, replacement_window_days)
VALUES
  ('California-LHP',         'lhp',         3500, 7000,  14000, 'act_788484706914452', 'LHP',  'Larry H. Parker', 250, 28),
  ('Georgia-MCA',            'mca',         2000, 5600,  11200, 'act_788484706914452', NULL,    'Georgia-MCA',     250, 14),
  ('Fears Law',              'fears',          0, 5000,  15000, NULL,                  'FL',    'Fears Law',         0, 14),
  ('Eisenberg Law Group PC', 'eisenberg',      0, 5000,  15000, NULL,                  NULL,    NULL,                0, 14),
  ('The Herro Law Firm',     'thl',            0, 5000,  15000, NULL,                  NULL,    NULL,                0, 14),
  ('LHP Spanish',            'lhp_spanish',    0, 5000,  15000, NULL,                  NULL,    NULL,                0, 14),
  ('Levine Law',             'jll',            0, 5000,  15000, NULL,                  NULL,    'JLL',               0, 14),
  ('Jacoby & Meyers',        'jm',             0, 5000,  15000, NULL,                  NULL,    'Jacoby and Meyers', 0, 14)
ON CONFLICT (slug) DO UPDATE SET
  name                          = EXCLUDED.name,
  case_value                    = EXCLUDED.case_value,
  phase_initial_max_weekly_spend = EXCLUDED.phase_initial_max_weekly_spend,
  phase_scale_max_weekly_spend   = EXCLUDED.phase_scale_max_weekly_spend,
  meta_account_id               = EXCLUDED.meta_account_id,
  meta_campaign_filter          = EXCLUDED.meta_campaign_filter,
  ghl_location_name             = EXCLUDED.ghl_location_name,
  sanguine_rate_per_closed_case = EXCLUDED.sanguine_rate_per_closed_case,
  replacement_window_days       = EXCLUDED.replacement_window_days;

-- 2. Restore LHP KPI targets
UPDATE public.firms SET
  target_initial_daily_spend  = 1000,
  target_initial_daily_leads  = 5,
  target_scale_daily_spend    = 2000,
  target_scale_daily_leads    = 10,
  target_max_daily_spend      = 4000,
  target_max_daily_leads      = 20,
  target_cpq                  = 1400,
  target_gross_margin         = 60
WHERE slug = 'lhp';

-- 3. Restore MCA KPI targets
UPDATE public.firms SET
  target_initial_daily_spend  = 800,
  target_initial_daily_leads  = 5,
  target_scale_daily_spend    = 1600,
  target_scale_daily_leads    = 10,
  target_max_daily_spend      = 3200,
  target_max_daily_leads      = 20,
  target_cpq                  = 800,
  target_gross_margin         = 60
WHERE slug = 'mca';

-- 4. Restore invoice periods (MCA)
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-02-28', '2026-03-18', 1 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO NOTHING;

INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-2', 'Invoice 2', '2026-03-19', '2026-04-12', 2 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO NOTHING;

INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-3', 'Invoice 3', '2026-04-13', '2026-12-31', 3 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO NOTHING;

-- 5. Restore LHP invoice (with payment data)
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order, payment_received, payment_interest_rate)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-01-01', '2026-12-31', 1, 35000, 0.03
FROM public.firms f WHERE f.slug = 'lhp'
ON CONFLICT (firm_id, code) DO UPDATE SET
  payment_received      = 35000,
  payment_interest_rate = 0.03,
  period_start          = '2026-01-01',
  period_end            = '2026-12-31',
  sort_order            = 1;

-- 6. Restore JLL invoice
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-01-01', '2026-12-31', 1
FROM public.firms f WHERE f.slug = 'jll'
ON CONFLICT (firm_id, code) DO NOTHING;

-- 7. Reassociate ghl_leads with restored firm IDs
UPDATE public.ghl_leads SET firm_id = f.id
FROM public.firms f WHERE f.slug = 'mca'
  AND public.ghl_leads.firm_id IS NULL
  AND (public.ghl_leads.location_name ILIKE '%mca%' OR public.ghl_leads.location_name ILIKE '%georgia%');

UPDATE public.ghl_leads SET firm_id = f.id
FROM public.firms f WHERE f.slug = 'lhp'
  AND public.ghl_leads.firm_id IS NULL
  AND (public.ghl_leads.location_name ILIKE '%parker%' OR public.ghl_leads.location_name ILIKE '%lhp%');

UPDATE public.ghl_leads SET firm_id = f.id
FROM public.firms f WHERE f.slug = 'jll'
  AND public.ghl_leads.firm_id IS NULL
  AND (public.ghl_leads.location_name ILIKE '%jll%' OR public.ghl_leads.location_name ILIKE '%levine%');
