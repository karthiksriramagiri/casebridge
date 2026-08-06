-- Rep heartbeat tracking for device type + activity time analytics
-- Heartbeat sent every 30s from client; device classified by screen width

CREATE TABLE IF NOT EXISTS dialer_rep_heartbeats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_identity  TEXT NOT NULL,
  device_type   TEXT NOT NULL,          -- 'desktop' | 'mobile' | 'tablet'
  status        TEXT NOT NULL,          -- 'READY' | 'ON_CALL' | 'PAUSED' | 'OFFLINE'
  screen_width  INT,                    -- window.innerWidth
  screen_height INT,                    -- window.innerHeight
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query pattern: aggregate by rep + date range + device/status
CREATE INDEX idx_heartbeats_rep_time ON dialer_rep_heartbeats (rep_identity, created_at DESC);
CREATE INDEX idx_heartbeats_time     ON dialer_rep_heartbeats (created_at DESC);

-- Auto-purge heartbeats older than 90 days to keep table lean
-- Run periodically: DELETE FROM dialer_rep_heartbeats WHERE created_at < now() - INTERVAL '90 days';
