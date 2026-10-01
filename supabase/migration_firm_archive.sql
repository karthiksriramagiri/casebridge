-- ─────────────────────────────────────────────────────────────────────────────
-- Archiving a firm
--
-- Firms end. Deleting the row would take the leads, invoices and expenses with
-- it and quietly rewrite every past month those numbers belonged to — a P&L
-- that changes retroactively is worse than one that carries a name nobody
-- works with any more.
--
-- Archiving hides a firm from the live views and leaves history alone. It is
-- one boolean and it is reversible.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firms ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_firms_archived ON firms (archived) WHERE archived = FALSE;
