-- ============================================================
-- KPI / Business Intelligence tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- Firms
CREATE TABLE IF NOT EXISTS public.firms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  case_value numeric NOT NULL DEFAULT 0,
  phase_initial_max_weekly_spend numeric NOT NULL DEFAULT 5000,
  phase_scale_max_weekly_spend numeric NOT NULL DEFAULT 15000,
  meta_account_id text,
  replacement_window_days integer NOT NULL DEFAULT 14,
  created_at timestamptz DEFAULT now()
);

-- GHL Leads (qualified/signed cases ingested from GHL webhooks)
CREATE TABLE IF NOT EXISTS public.ghl_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid REFERENCES public.firms(id),
  contact_id text,
  contact_name text,
  contact_phone text,
  contact_email text,
  fbp text,
  fbc text,
  session_source text,
  ad_name text,
  ad_id text,
  adset_id text,
  campaign_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  workflow_name text,
  location_name text,
  victim_count integer NOT NULL DEFAULT 1,
  invoice_code text,
  case_status text NOT NULL DEFAULT 'e_signed',
  closed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  form_data jsonb,
  raw_payload jsonb,
  qualified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Invoice periods (billing / Meta / expense windows per firm)
CREATE TABLE IF NOT EXISTS public.firm_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (firm_id, code)
);

-- Ops Expenses (firm_id = null means shared/allocated across all firms)
CREATE TABLE IF NOT EXISTS public.ops_expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid REFERENCES public.firms(id),
  date date NOT NULL,
  amount numeric NOT NULL,
  description text,
  category text DEFAULT 'other',
  invoice_code text,
  created_at timestamptz DEFAULT now()
);

-- Worker Pay Rates (weekly rate per rep)
CREATE TABLE IF NOT EXISTS public.worker_pay_rates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekly_rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ghl_leads_firm_id ON public.ghl_leads(firm_id);
CREATE INDEX IF NOT EXISTS idx_ghl_leads_qualified_at ON public.ghl_leads(qualified_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_leads_ad_id ON public.ghl_leads(ad_id);
CREATE INDEX IF NOT EXISTS idx_ghl_leads_contact_id ON public.ghl_leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_leads_invoice ON public.ghl_leads(firm_id, invoice_code);
CREATE INDEX IF NOT EXISTS idx_ghl_leads_case_status ON public.ghl_leads(firm_id, case_status);
CREATE INDEX IF NOT EXISTS idx_firm_invoices_firm ON public.firm_invoices(firm_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ops_expenses_date ON public.ops_expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_ops_expenses_firm ON public.ops_expenses(firm_id);
CREATE INDEX IF NOT EXISTS idx_ops_expenses_invoice ON public.ops_expenses(firm_id, invoice_code);
CREATE INDEX IF NOT EXISTS idx_worker_pay_rates_profile ON public.worker_pay_rates(profile_id);

-- Seed firms
-- Phase thresholds based on your financial model:
--   Initial ≤ $5,600/wk | Scale ≤ $11,200/wk | Max above
INSERT INTO public.firms (name, slug, case_value, phase_initial_max_weekly_spend, phase_scale_max_weekly_spend, meta_account_id)
VALUES
  ('Georgia-MCA',    'mca', 2000, 5600,  11200, 'act_788484706914452'),
  ('California-LHP', 'lhp', 3500, 5600,  11200, null)
ON CONFLICT (slug) DO NOTHING;

-- Default MCA invoice periods (edit in Supabase if your sheet dates differ)
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-02-28', '2026-03-18', 1 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO NOTHING;
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-2', 'Invoice 2', '2026-03-19', '2026-04-12', 2 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO NOTHING;
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-3', 'Invoice 3', '2026-04-13', '2026-12-31', 3 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO NOTHING;