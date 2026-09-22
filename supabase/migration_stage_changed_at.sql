-- Add stage_changed_at to dialer_attempts for sorting NR leads by recency
ALTER TABLE dialer_attempts ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_attempts_stage_changed ON dialer_attempts (stage_changed_at DESC NULLS LAST) WHERE status = 'pending';
