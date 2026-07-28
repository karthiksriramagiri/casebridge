-- Dialer Queue: server-managed calling queue with cadence, ownership, callbacks

CREATE TABLE IF NOT EXISTS dialer_queue (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           TEXT NOT NULL,
  contact_name         TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL,
  firm                 TEXT NOT NULL,          -- 'lhp' | 'fears'
  pipeline_id          TEXT NOT NULL,
  stage_id             TEXT NOT NULL,
  stage_name           TEXT NOT NULL DEFAULT '',
  timezone             TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  ghl_opportunity_id   TEXT,                   -- for stage moves
  owner_rep_identity   TEXT,                   -- set after first real conversation
  priority             INTEGER NOT NULL DEFAULT 5,
  -- 1=appointment callback, 2=contract sent, 3=chase, 4=follow up required, 5=no response
  next_attempt_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count        INTEGER NOT NULL DEFAULT 0,
  callback_at          TIMESTAMPTZ,
  callback_for_rep     TEXT,                   -- owner who should get it first
  callback_context     TEXT,
  locked_by            TEXT,                   -- rep_identity currently dialing
  locked_at            TIMESTAMPTZ,
  exhausted            BOOLEAN NOT NULL DEFAULT FALSE,  -- only set for terminal dispositions
  exhausted_at         TIMESTAMPTZ,
  last_called_at       TIMESTAMPTZ,
  last_disposition     TEXT,
  added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per contact+pipeline (one queue slot per lead per pipeline)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dialer_queue_contact_pipeline
  ON dialer_queue (contact_id, pipeline_id);

CREATE INDEX IF NOT EXISTS idx_dialer_queue_next
  ON dialer_queue (exhausted, next_attempt_at, priority)
  WHERE NOT exhausted;

CREATE INDEX IF NOT EXISTS idx_dialer_queue_callback
  ON dialer_queue (callback_at)
  WHERE callback_at IS NOT NULL AND NOT exhausted;

CREATE INDEX IF NOT EXISTS idx_dialer_queue_owner
  ON dialer_queue (owner_rep_identity)
  WHERE owner_rep_identity IS NOT NULL;

-- Queue is self-managing — no separate config table needed.
-- Cadence rules are baked into queue-engine.ts:
--   No Response:          4x/day if lead < 10 days old, 3x/day after  (6h / 8h gap)
--   Follow Up Required:   same as No Response
--   Chase:                3x/day  (8h gap)
--   Contract Sent:        2x/day  (12h gap — timezone window gives morning + evening naturally)
--   Appointment Scheduled: callback-only — next_attempt_at set 1 year out on sync
