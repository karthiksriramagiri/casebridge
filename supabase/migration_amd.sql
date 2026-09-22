-- Add answered_by column for Twilio AMD (Answering Machine Detection)
-- Values: human | machine_start | machine_end_beep | machine_end_silence | machine_end_other | fax | unknown | null
ALTER TABLE dialer_calls ADD COLUMN IF NOT EXISTS answered_by text DEFAULT null;
ALTER TABLE dialer_active_sessions ADD COLUMN IF NOT EXISTS answered_by text DEFAULT null;
