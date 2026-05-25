-- ============================================================
-- Timeclock / Time Entries
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add hourly_rate to worker_pay_rates (default $5/hr)
ALTER TABLE public.worker_pay_rates
  ADD COLUMN IF NOT EXISTS hourly_rate numeric NOT NULL DEFAULT 5;

-- Clock-in / clock-out entries (one row per shift)
CREATE TABLE IF NOT EXISTS public.time_entries (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  clock_in    timestamptz NOT NULL DEFAULT now(),
  clock_out   timestamptz,
  note        text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_entries_profile_date ON public.time_entries(profile_id, date);
CREATE INDEX IF NOT EXISTS time_entries_date ON public.time_entries(date);

-- RLS: service role can do everything (admin API uses service key)
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.time_entries
  FOR ALL USING (true) WITH CHECK (true);
