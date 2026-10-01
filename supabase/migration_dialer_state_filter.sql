-- ─────────────────────────────────────────────────────────────────────────────
-- CaseBridge Dialer — queue state filter
-- One row of admin-editable queue settings. Reps only get served leads whose
-- state (resolved from the lead's area code) passes this filter.
--   mode = 'off'      → every state is called (default)
--   mode = 'include'  → ONLY the listed states are called (e.g. {CA})
--   mode = 'exclude'  → every state EXCEPT the listed ones is called
-- Callbacks always bypass the filter — a rep already promised that call.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dialer_queue_settings (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state_filter_mode  TEXT   NOT NULL DEFAULT 'off' CHECK (state_filter_mode IN ('off','include','exclude')),
  state_filter_list  TEXT[] NOT NULL DEFAULT '{}',   -- two-letter codes, upper case
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         TEXT
);

INSERT INTO dialer_queue_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Firm filter — added after the state filter shipped.
--
-- Same shape, different axis. A firm is not a state: Fears is Texas, but the
-- reverse does not hold — LHP and J&M both run Texas numbers — so filtering by
-- state cannot stand in for "stop dialling this client", and neither filter
-- makes the other redundant. Both apply; a lead has to pass both to be served.
--
-- Re-running this file is safe: the ALTERs are idempotent, so an account that
-- already has the state filter gets the firm columns without losing its
-- current setting.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE dialer_queue_settings
  ADD COLUMN IF NOT EXISTS firm_filter_mode TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS firm_filter_list TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE dialer_queue_settings DROP CONSTRAINT IF EXISTS dialer_queue_settings_firm_filter_mode_check;
ALTER TABLE dialer_queue_settings ADD CONSTRAINT dialer_queue_settings_firm_filter_mode_check
  CHECK (firm_filter_mode IN ('off','include','exclude'));
