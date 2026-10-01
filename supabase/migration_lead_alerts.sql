-- ─────────────────────────────────────────────────────────────────────────────
-- Which leads Slack has already been told about
--
-- The alert is driven by an API sweep across every pipeline's New Lead stage,
-- not by one workflow webhook per pipeline — there are eleven of those stages
-- and a workflow that is missing, disabled or pointed at a stale URL fails
-- silently.
--
-- A sweep re-reads the same opportunities every run, so it needs to know what
-- it has already announced. One row per opportunity, written the moment the
-- message is sent; the primary key is what makes a double-post impossible even
-- if two runs overlap.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_alerts (
  opportunity_id TEXT PRIMARY KEY,
  contact_name   TEXT,
  pipeline       TEXT,
  ad_id          TEXT,
  -- When the opportunity was created in GHL, not when we noticed it. Lets a
  -- late alert still be read against the lead's real arrival time.
  lead_created_at TIMESTAMPTZ,
  notified_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_alerts_notified ON lead_alerts (notified_at DESC);
