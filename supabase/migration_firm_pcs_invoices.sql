-- Firm dashboard: PC list (invoice, status, replacement window), worker attribution
-- Run in Supabase SQL Editor after migration_kpi.sql

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS replacement_window_days integer NOT NULL DEFAULT 14;

ALTER TABLE public.ghl_leads
  ADD COLUMN IF NOT EXISTS invoice_code text,
  ADD COLUMN IF NOT EXISTS case_status text NOT NULL DEFAULT 'e_signed',
  ADD COLUMN IF NOT EXISTS closed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_leads_invoice ON public.ghl_leads(firm_id, invoice_code);
CREATE INDEX IF NOT EXISTS idx_ghl_leads_case_status ON public.ghl_leads(firm_id, case_status);

-- Backfill MCA invoice buckets (matches seeded import from invoices)
UPDATE public.ghl_leads gl
SET invoice_code = 'INV-1'
FROM public.firms f
WHERE gl.firm_id = f.id AND f.slug = 'mca'
  AND gl.contact_name IN (
    'Tameka Mouzon', 'Randall Yaughn', 'Monica Little', 'Lauren Brown', 'Cynthia Steward'
  );

UPDATE public.ghl_leads gl
SET invoice_code = 'INV-2'
FROM public.firms f
WHERE gl.firm_id = f.id AND f.slug = 'mca'
  AND gl.contact_name IN (
    'Mariejo Johnson', 'Alexis Wilson', 'Ernest Miller Jr', 'Kimora Jenkins', 'Tylique Prescott',
    'Stephen Asomah', 'Danielle Wright', 'Darrell Mintz', 'Derrick Gibson', 'Justin Adams'
  );

UPDATE public.ghl_leads gl
SET invoice_code = 'INV-3'
FROM public.firms f
WHERE gl.firm_id = f.id AND f.slug = 'mca'
  AND gl.contact_name IN (
    'Jason Gaskin', 'Myron Sims', 'Crystal Post', 'Gary Lovingood'
  );
