-- ─────────────────────────────────────────────────────────────────────────────
-- ghl_leads.pipeline_stage
--
-- /api/webhooks/ghl/pipeline-stage writes this column on every stage change,
-- and it does not exist — so every one of those webhook deliveries has been
-- failing with a 500 and GHL has been retrying them into the same error.
--
-- The convention the rest of the code already assumes:
--   pipeline_stage IS NULL  → a signed case  (written by /api/webhooks/ghl)
--   pipeline_stage = '…'    → a lead sitting at that stage
--
-- app/api/finance/overview already try/catches around this column's absence,
-- which is how the finance pages kept working while the webhook did not.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ghl_leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT;

-- Signed records stay NULL; the partial index keeps the "signed only" reads
-- the finance side does from scanning the lead rows.
CREATE INDEX IF NOT EXISTS idx_ghl_leads_signed
  ON ghl_leads (firm_id, created_at DESC) WHERE pipeline_stage IS NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_leads_stage
  ON ghl_leads (pipeline_stage, created_at DESC) WHERE pipeline_stage IS NOT NULL;
