-- Add per-phase KPI target columns to firms
-- These drive the dashboard "vs model targets" section

ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_initial_daily_spend  numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_initial_daily_leads  numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_scale_daily_spend    numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_scale_daily_leads    numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_max_daily_spend      numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_max_daily_leads      numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_cpq                  numeric;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS target_gross_margin         numeric;

-- California - LHP phase thresholds
-- Initial  ≤ $7,000/wk  |  Scale ≤ $14,000/wk  |  Max above
UPDATE firms SET
  phase_initial_max_weekly_spend = 7000,
  phase_scale_max_weekly_spend   = 14000,

  -- Initial Phase: $1k/day, 5 leads/day → $7k/wk, 35 leads/wk
  target_initial_daily_spend  = 1000,
  target_initial_daily_leads  = 5,

  -- Scale Phase: $2k/day, 10 leads/day → $14k/wk, 70 leads/wk
  target_scale_daily_spend    = 2000,
  target_scale_daily_leads    = 10,

  -- Max Phase: $4k/day, 20 leads/day → $28k/wk, 140 leads/wk
  target_max_daily_spend      = 4000,
  target_max_daily_leads      = 20,

  -- CPQ target ($1,400) and gross margin (60%) are the same across phases
  target_cpq           = 1400,
  target_gross_margin  = 60
WHERE slug = 'lhp';

-- Georgia - MCA (update with explicit values so they're stored, not just defaulted)
-- Initial ≤ $5,600/wk | Scale ≤ $11,200/wk
-- Existing targets: $800/day, 5 leads/day, CPQ ~$800, margin 60%
UPDATE firms SET
  target_initial_daily_spend  = 800,
  target_initial_daily_leads  = 5,
  target_scale_daily_spend    = 1600,
  target_scale_daily_leads    = 10,
  target_max_daily_spend      = 3200,
  target_max_daily_leads      = 20,
  target_cpq                  = 800,
  target_gross_margin         = 60
WHERE slug = 'mca';
