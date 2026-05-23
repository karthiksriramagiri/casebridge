CREATE TABLE IF NOT EXISTS attribution_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_email text,
  contact_phone text,
  contact_first_name text,
  contact_last_name text,
  event_name text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_event_name ON attribution_events(event_name);
CREATE INDEX IF NOT EXISTS idx_attribution_utm_content ON attribution_events(utm_content);
CREATE INDEX IF NOT EXISTS idx_attribution_created_at ON attribution_events(created_at DESC);
