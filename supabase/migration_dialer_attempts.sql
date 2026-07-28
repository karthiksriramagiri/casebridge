-- ─────────────────────────────────────────────────────────────────────────────
-- CaseBridge Dialer — Attempt-Based Queue Engine
-- Migration: dialer_cadence_rules · dialer_lead_state · dialer_attempts
-- Plus the concurrency-safe Postgres RPC for buffer selection.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Cadence rules (admin-configurable) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS dialer_cadence_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_name   TEXT    NOT NULL,
  calls_per_day INT    NOT NULL DEFAULT 2,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_name)
);

INSERT INTO dialer_cadence_rules (stage_name, calls_per_day) VALUES
  ('Contract Sent',       2),
  ('Chase',               3),
  ('Follow Up Required',  3),
  ('No Response',         4),
  ('Appointment Scheduled', 1)
ON CONFLICT (stage_name) DO NOTHING;

-- ── 2. Lead state — durable, one row per contact ────────────────────────────
CREATE TABLE IF NOT EXISTS dialer_lead_state (
  contact_id        TEXT PRIMARY KEY,
  owner_rep         TEXT,
  owner_set_at      TIMESTAMPTZ,
  last_dialed_at    TIMESTAMPTZ,
  last_disposition  TEXT,
  exhausted         BOOLEAN NOT NULL DEFAULT FALSE,
  suppressed        BOOLEAN NOT NULL DEFAULT FALSE,
  suppressed_at     TIMESTAMPTZ,
  suppressed_reason TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_state_suppressed ON dialer_lead_state (suppressed) WHERE suppressed = TRUE;
CREATE INDEX IF NOT EXISTS idx_lead_state_exhausted  ON dialer_lead_state (exhausted)  WHERE exhausted  = TRUE;

-- ── 3. Attempts — core queue unit ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dialer_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lead identity + display
  contact_id       TEXT NOT NULL,
  contact_name     TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL,
  firm             TEXT NOT NULL,          -- 'lhp' | 'fears'
  pipeline_id      TEXT NOT NULL,
  stage_id         TEXT NOT NULL,
  stage_name       TEXT NOT NULL DEFAULT '',
  ghl_opportunity_id TEXT,

  -- Plan metadata
  plan_date        DATE        NOT NULL,   -- date this attempt belongs to (lead local)
  attempt_number   INT         NOT NULL,   -- 1..4
  attempts_total   INT         NOT NULL,   -- how many calls planned today for this lead
  block            TEXT        NOT NULL,   -- 'morning'|'afternoon'|'evening'|'night'
  lead_timezone    TEXT        NOT NULL DEFAULT 'America/Los_Angeles',
  due_from         TIMESTAMPTZ NOT NULL,   -- block opens (UTC)
  due_until        TIMESTAMPTZ NOT NULL,   -- block closes (UTC)
  day_ends_at      TIMESTAMPTZ NOT NULL,   -- 8:30 PM lead-local → UTC (hard cut-off)

  -- Priority (higher = sooner)
  priority         INT         NOT NULL DEFAULT 100,
  is_carryover     BOOLEAN     NOT NULL DEFAULT FALSE,  -- bumped +50 when block closes

  -- Lifecycle
  status           TEXT        NOT NULL DEFAULT 'pending',
  -- pending | buffered | leased | completed | merged | cancelled | expired

  -- Buffer
  buffered_for     TEXT,
  buffered_at      TIMESTAMPTZ,

  -- Lease (held while dialing)
  leased_by        TEXT,
  leased_at        TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,

  -- Completion
  completed_by     TEXT,
  completed_at     TIMESTAMPTZ,
  disposition      TEXT,
  call_sid         TEXT,

  -- Callback
  is_callback      BOOLEAN NOT NULL DEFAULT FALSE,
  callback_at      TIMESTAMPTZ,

  -- Ownership
  owner_rep        TEXT,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Unique regular-attempt per contact per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_contact_plan_num
  ON dialer_attempts (contact_id, plan_date, attempt_number)
  WHERE NOT is_callback;

-- Selection query index
CREATE INDEX IF NOT EXISTS idx_attempts_pending
  ON dialer_attempts (status, plan_date, due_from, priority DESC)
  WHERE status = 'pending';

-- Buffer lookup (rep's queue)
CREATE INDEX IF NOT EXISTS idx_attempts_buffered
  ON dialer_attempts (buffered_for, plan_date)
  WHERE status = 'buffered';

-- Leased lookup
CREATE INDEX IF NOT EXISTS idx_attempts_leased
  ON dialer_attempts (leased_by, lease_expires_at)
  WHERE status = 'leased';

-- Callback due lookup
CREATE INDEX IF NOT EXISTS idx_attempts_callback
  ON dialer_attempts (callback_at)
  WHERE is_callback = TRUE AND status = 'pending';

-- Contact + date (for cancellation queries)
CREATE INDEX IF NOT EXISTS idx_attempts_contact_date
  ON dialer_attempts (contact_id, plan_date, status);

-- ── 4. Supabase Realtime ─────────────────────────────────────────────────────
-- These tables are published so the admin queue page and agent rail
-- can subscribe to live changes without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE dialer_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE dialer_rep_status;

-- ── 5. Concurrency-safe buffer selection RPC ─────────────────────────────────
-- Called from /api/dialer/queue/buffer/refill and /api/dialer/queue/next.
-- Uses FOR UPDATE SKIP LOCKED — two concurrent calls never return the same attempt.
CREATE OR REPLACE FUNCTION select_and_buffer_attempts(
  p_rep   TEXT,
  p_count INT DEFAULT 5
)
RETURNS SETOF dialer_attempts
LANGUAGE plpgsql
AS $$
DECLARE
  v_now      TIMESTAMPTZ := now();
  v_gap      TIMESTAMPTZ := now() - interval '2 hours';
  -- Use Eastern date — midnight ET is the day boundary (cron runs at 5 AM UTC = midnight ET)
  v_today    DATE        := (now() AT TIME ZONE 'America/New_York')::DATE;
BEGIN

  -- ① Expire stale leases (browser crash, dropped call, etc.)
  UPDATE dialer_attempts
  SET
    status           = 'pending',
    leased_by        = NULL,
    leased_at        = NULL,
    lease_expires_at = NULL,
    updated_at       = v_now
  WHERE
    status           = 'leased'
    AND lease_expires_at < v_now
    AND plan_date    = v_today;

  -- ② Mark carryover: blocks that have closed but day hasn't ended
  --    Only bumped once (is_carryover was FALSE).
  UPDATE dialer_attempts
  SET
    is_carryover = TRUE,
    priority     = priority + 50,
    updated_at   = v_now
  WHERE
    status       = 'pending'
    AND plan_date   = v_today
    AND due_until   < v_now
    AND day_ends_at > v_now
    AND is_carryover = FALSE;

  -- ③ Merge: if contact has a carryover attempt AND a now-due later attempt,
  --    cancel the later one (one call per 2hr gap anyway; serve the overdue first).
  UPDATE dialer_attempts
  SET status = 'merged', updated_at = v_now
  FROM (
    SELECT later_a.id
    FROM   dialer_attempts later_a
    JOIN   dialer_attempts earlier_a
           ON earlier_a.contact_id = later_a.contact_id
    WHERE  later_a.status       = 'pending'
    AND    later_a.plan_date    = v_today
    AND    later_a.is_carryover = FALSE
    AND    later_a.due_from    <= v_now
    AND    earlier_a.status     = 'pending'
    AND    earlier_a.plan_date  = v_today
    AND    earlier_a.is_carryover = TRUE
  ) AS to_merge
  WHERE dialer_attempts.id = to_merge.id;

  -- ④ Select up to p_count attempts and buffer them for p_rep
  RETURN QUERY
  WITH candidates AS (
    SELECT a.id
    FROM   dialer_attempts    a
    LEFT JOIN dialer_lead_state  ls ON ls.contact_id  = a.contact_id
    LEFT JOIN dialer_rep_status  rs ON rs.rep_identity = a.owner_rep
    WHERE
      a.status      = 'pending'
      AND a.plan_date  = v_today
      AND a.day_ends_at > v_now       -- never call after 8:30 PM lead time

      -- Suppressed / exhausted leads never served
      AND (ls.suppressed IS NULL OR ls.suppressed = FALSE)
      AND (ls.exhausted  IS NULL OR ls.exhausted  = FALSE)

      -- 2-hour minimum gap since last dial on this contact
      AND (ls.last_dialed_at IS NULL OR ls.last_dialed_at < v_gap)

      -- Ownership gate: unowned, owned by this rep, or owner is offline/absent
      AND (
        a.owner_rep IS NULL
        OR a.owner_rep = p_rep
        OR rs.status = 'OFFLINE'
        OR rs.rep_identity IS NULL
      )

      -- Only one attempt per contact in any buffer/on any call at a time
      AND a.contact_id NOT IN (
        SELECT contact_id
        FROM   dialer_attempts
        WHERE  plan_date = v_today
        AND    status IN ('buffered', 'leased')
      )
      -- Don't serve attempt N until all earlier attempts for this contact are done
      AND NOT EXISTS (
        SELECT 1 FROM dialer_attempts prev
        WHERE prev.contact_id    = a.contact_id
          AND prev.plan_date     = v_today
          AND prev.is_callback   = false
          AND prev.attempt_number < a.attempt_number
          AND prev.status NOT IN ('completed','cancelled','merged','expired')
      )

    ORDER BY
      -- Own callbacks due right now come first
      (a.is_callback AND a.callback_at <= v_now AND a.owner_rep = p_rep) DESC,
      -- Owned by this rep before floor leads
      (a.owner_rep = p_rep) DESC,
      -- Higher stage priority
      a.priority DESC,
      -- Carryover before freshly-due
      a.is_carryover DESC,
      -- Longest waiting
      ls.last_dialed_at ASC NULLS FIRST,
      a.due_from ASC
    LIMIT p_count
    FOR UPDATE OF a SKIP LOCKED
  ),
  buffered AS (
    UPDATE dialer_attempts
    SET
      status       = 'buffered',
      buffered_for  = p_rep,
      buffered_at   = v_now,
      updated_at    = v_now
    FROM candidates
    WHERE dialer_attempts.id = candidates.id
    RETURNING dialer_attempts.*
  )
  SELECT * FROM buffered;

END;
$$;
