-- Add disposition column to dialer_calls so we can display it directly
-- without joining through dialer_attempts
ALTER TABLE dialer_calls ADD COLUMN IF NOT EXISTS disposition text;
ALTER TABLE dialer_calls ADD COLUMN IF NOT EXISTS nq_reason text;
