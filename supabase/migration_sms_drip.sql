-- SMS drip automation: scheduled outbound messages for cold outreach
-- Triggered on first "No Answer" disposition, cancelled when a PC replies manually.

-- Scheduled drip messages
CREATE TABLE IF NOT EXISTS public.dialer_sms_drip (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT NOT NULL,
  firm          TEXT,
  template_key  TEXT NOT NULL,        -- e.g. 'day_1_am', 'day_3_pm'
  message       TEXT NOT NULL,        -- fully rendered message body
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled
  scheduled_at  TIMESTAMPTZ NOT NULL, -- when to send (10am or 6pm local)
  sent_at       TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_drip_pending
  ON public.dialer_sms_drip (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sms_drip_contact
  ON public.dialer_sms_drip (contact_id);

-- Track automation state on the lead
ALTER TABLE public.dialer_lead_state
  ADD COLUMN IF NOT EXISTS sms_drip_active     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_drip_started_at TIMESTAMPTZ;
