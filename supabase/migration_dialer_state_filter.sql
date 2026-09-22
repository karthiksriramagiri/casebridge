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
