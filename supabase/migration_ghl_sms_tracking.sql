-- Track GHL outbound SMS and detect no-reply within 5 minutes
CREATE TABLE IF NOT EXISTS public.ghl_sms_tracking (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id   text NOT NULL UNIQUE,
  contact_id   text NOT NULL,
  contact_name text,
  phone        text,
  body         text,
  direction    text NOT NULL,            -- 'outbound' | 'inbound'
  sent_at      timestamptz NOT NULL DEFAULT now(),
  replied      boolean NOT NULL DEFAULT false,
  replied_at   timestamptz,
  notified     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ghl_sms_tracking_contact ON public.ghl_sms_tracking (contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_sms_tracking_unreplied ON public.ghl_sms_tracking (sent_at)
  WHERE direction = 'outbound' AND replied = false AND notified = false;
