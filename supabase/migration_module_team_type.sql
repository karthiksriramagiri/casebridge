-- Add team_type to modules so intake and creative have separate content
ALTER TABLE modules ADD COLUMN IF NOT EXISTS team_type text DEFAULT 'intake';
-- All existing modules belong to intake team
UPDATE modules SET team_type = 'intake' WHERE team_type IS NULL;
