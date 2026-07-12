-- Tracks which contacts have been sent to powerdialer per stage
-- so we never send duplicates on re-sync
CREATE TABLE IF NOT EXISTS powerdialer_sent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    text NOT NULL,
  stage_id      text NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, stage_id)
);

CREATE INDEX IF NOT EXISTS powerdialer_sent_stage_idx ON powerdialer_sent (stage_id);
