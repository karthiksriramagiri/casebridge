-- Map Twilio phone numbers to firms so caller ID selection is firm-scoped
CREATE TABLE IF NOT EXISTS dialer_number_firms (
  phone_number TEXT PRIMARY KEY,         -- E.164 format: +1XXXXXXXXXX
  firm         TEXT NOT NULL,            -- firm slug: 'lhp', 'fears', etc.
  created_at   TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE dialer_number_firms
  IS 'Maps purchased Twilio numbers to firms — used for firm-scoped caller ID selection';

CREATE INDEX IF NOT EXISTS idx_number_firms_firm ON dialer_number_firms(firm);
