-- Add callback_context to dialer_attempts for storing callback notes
ALTER TABLE dialer_attempts ADD COLUMN IF NOT EXISTS callback_context TEXT;
