-- ─────────────────────────────────────────────────────────────────────────────
-- Creative decisions — the Keep / Watch / Kill call, recorded
--
-- This is an audit of what the team decided, not an instruction to Meta. The
-- dashboard never pauses an ad: someone still does that in Ads Manager. What
-- this buys is the ability to ask "we said kill on the 14th — did it actually
-- stop?" and to stop re-litigating the same creative every morning.
--
-- One row per decision, never updated. The current call for an ad is its
-- newest row, so the history of a creative that was watched, kept, then
-- killed stays legible.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creative_decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id       TEXT NOT NULL,
  ad_name     TEXT NOT NULL DEFAULT '',
  decision    TEXT NOT NULL CHECK (decision IN ('keep', 'watch', 'kill')),
  -- What the dashboard was showing when the call was made, so a decision can
  -- be read back against the numbers that prompted it rather than today's.
  cpl_at_time      NUMERIC,
  spend_at_time    NUMERIC,
  verdict_at_time  TEXT,
  note        TEXT,
  decided_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_decisions_ad
  ON creative_decisions (ad_id, created_at DESC);
