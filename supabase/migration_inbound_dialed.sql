-- Store which Twilio number the caller dialed
ALTER TABLE dialer_inbound_queue ADD COLUMN IF NOT EXISTS dialed_number text;
