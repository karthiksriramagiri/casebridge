-- Add Levine Law (JLL) firm and Invoice 1
-- Run in Supabase SQL Editor

-- 1. Insert Levine Law firm
INSERT INTO public.firms (name, slug, ghl_location_name, case_value, replacement_window_days)
VALUES ('Levine Law', 'jll', 'JLL', 0, 14)
ON CONFLICT (slug) DO UPDATE SET
  name               = EXCLUDED.name,
  ghl_location_name  = EXCLUDED.ghl_location_name;

-- 2. Create Invoice 1
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-01-01', '2026-12-31', 1
FROM public.firms f
WHERE f.slug = 'jll'
ON CONFLICT (firm_id, code) DO NOTHING;

-- 3. Backfill existing cases from JLL location → Levine Law firm + INV-1
UPDATE public.ghl_leads
SET
  firm_id      = f.id,
  invoice_code = 'INV-1'
FROM public.firms f
WHERE f.slug = 'jll'
  AND public.ghl_leads.firm_id IS DISTINCT FROM f.id
  AND (
    public.ghl_leads.location_name ILIKE '%jll%'
    OR public.ghl_leads.location_name ILIKE '%levine%'
  );
