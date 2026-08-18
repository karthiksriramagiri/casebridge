-- Add Spanish capability to reps and language tracking to attempts
ALTER TABLE dialer_users ADD COLUMN IF NOT EXISTS spanish BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dialer_attempts ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'en';
CREATE INDEX IF NOT EXISTS idx_dialer_attempts_lang ON dialer_attempts (lang) WHERE lang != 'en';
