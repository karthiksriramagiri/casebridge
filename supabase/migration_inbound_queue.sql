-- Inbound call queue: holds pending inbound calls so all reps can see and answer them
CREATE TABLE IF NOT EXISTS dialer_inbound_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid      text NOT NULL UNIQUE,
  conference_name text NOT NULL,
  caller_phone  text NOT NULL,
  contact_id    text,
  contact_name  text,
  firm          text,
  status        text NOT NULL DEFAULT 'ringing',  -- ringing | answered | missed | completed
  answered_by   text,                              -- rep identity who answered
  created_at    timestamptz NOT NULL DEFAULT now(),
  answered_at   timestamptz,
  ended_at      timestamptz
);

-- Enable Realtime so all rep browsers get notified instantly
ALTER PUBLICATION supabase_realtime ADD TABLE dialer_inbound_queue;

-- Index for quick lookup of active calls
CREATE INDEX IF NOT EXISTS idx_inbound_queue_status ON dialer_inbound_queue (status) WHERE status = 'ringing';
