-- Add pipeline_stage to ghl_leads
-- NULL (or 'signed') = signed contract (backward compat — all existing rows)
-- 'no_response' | 'not_qualified' | 'follow_up' | 'sent' = non-contracted pipeline leads
ALTER TABLE ghl_leads
  ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50);

-- Index for per-creative pipeline breakdowns
CREATE INDEX IF NOT EXISTS ghl_leads_pipeline_stage_idx ON ghl_leads (pipeline_stage);
CREATE INDEX IF NOT EXISTS ghl_leads_firm_pipeline_idx  ON ghl_leads (firm_id, pipeline_stage);
