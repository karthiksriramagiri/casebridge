-- ─────────────────────────────────────────────────────────────────────────────
-- Payments — money actually received
--
-- The Financial Center has always had two different numbers called revenue:
--   · booked   — a case is revenue the day it signs (cases × the firm's rate)
--   · collected — what the firm actually paid us
--
-- Booked is computed from signed cases. Collected was a figure typed onto each
-- invoice by hand, so it drifted from the payment processor and nothing could
-- reconcile the two. This table is the processor's own record: one row per
-- transaction, keyed on the processor's payment id so re-importing the same
-- export is a no-op rather than a double count.
--
-- Deliberately narrow. The export also carries billing addresses, phone
-- numbers, card last-4 and IP addresses; none of that is needed to answer a
-- finance question, so none of it is stored.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  -- The processor's order id (ORD-…). Natural key: it is what makes a re-import
  -- idempotent.
  payment_id    TEXT PRIMARY KEY,

  paid_at       TIMESTAMPTZ NOT NULL,
  -- Gross is what the firm was charged; net is what landed after processing
  -- fees. The difference is a real cost and is reported as one.
  gross         NUMERIC(12,2) NOT NULL,
  net           NUMERIC(12,2) NOT NULL,
  refunded      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'succeeded',

  -- Who paid. The domain is what maps a payment to a firm; the name is kept
  -- only so an unmapped payment is identifiable in the UI.
  payer_name    TEXT,
  payer_domain  TEXT,

  -- Null when the payer has no firm record — an early or one-off client. Those
  -- payments still count toward company revenue and surface under their own
  -- name, rather than being dropped for not matching.
  firm_id       UUID REFERENCES firms(id) ON DELETE SET NULL,

  -- "Case Bridge MVA Signed Retainer - 20 Cases" → 20. Lets a package price be
  -- read per case without re-parsing the label everywhere.
  product       TEXT,
  case_count    INT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_firm    ON payments (firm_id, paid_at DESC);

-- Map the payer domains we know about onto firms. Runs after any insert so the
-- seed does not have to hardcode firm uuids.
CREATE OR REPLACE FUNCTION link_payments_to_firms() RETURNS void
LANGUAGE sql AS $$
  UPDATE payments p SET firm_id = f.id
  FROM firms f
  WHERE p.firm_id IS NULL
    AND f.slug = CASE p.payer_domain
      WHEN 'jacobyandmeyers.com' THEN 'jm'
      WHEN 'fears.com'           THEN 'fl'
      WHEN 'gcelaw.com'          THEN 'eisenberg'
      ELSE NULL
    END;
$$;
