-- Add SMS-specific disposition to track message outcomes independently of call dispositions
ALTER TABLE public.dialer_lead_state
  ADD COLUMN IF NOT EXISTS sms_disposition TEXT,
  ADD COLUMN IF NOT EXISTS sms_disposition_at TIMESTAMPTZ;

COMMENT ON COLUMN dialer_lead_state.sms_disposition IS 'SMS disposition: callback, not_interested, qualified, dnc, etc.';
