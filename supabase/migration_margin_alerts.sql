-- ─────────────────────────────────────────────────────────────────────────────
-- Margin alerts
--
-- What the last alert said about each invoice, so the next run can tell a
-- margin that has actually moved from one that is merely being read again.
-- Without this the cron would either post every hour or post nothing: there
-- is no way to know "it dropped" from a single reading.
--
-- One row per invoice, written only by /api/cron/margin-alerts.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists invoice_margin_alerts (
  invoice_id       uuid primary key references firm_invoices(id) on delete cascade,

  -- The margin as it stood when this row was last written, and the 5-point
  -- band it sat in. The band is what alerting compares: a margin wandering
  -- between 61% and 59% has crossed a band once, not forty times.
  last_margin      numeric,
  last_band        integer,

  -- Whether the red alert for this invoice has already been sent. Cleared
  -- when the margin climbs back above the red line, so a second fall alerts
  -- again rather than passing in silence.
  red_alerted      boolean not null default false,

  -- When a message was last actually posted, as opposed to when the row was
  -- last read — the two differ on every quiet run.
  last_notified_at timestamptz,
  updated_at       timestamptz not null default now()
);

comment on table invoice_margin_alerts is
  'Last alerted margin per invoice. Written only by the margin-alerts cron.';
