-- Add second closer and OT close support to ghl_leads
ALTER TABLE public.ghl_leads
  ADD COLUMN IF NOT EXISTS second_closer_profile_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS second_closer TEXT,
  ADD COLUMN IF NOT EXISTS is_ot_close BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ghl_leads_second_closer ON public.ghl_leads(second_closer_profile_id);
