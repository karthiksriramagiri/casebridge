-- Add team_type to programs so intake and creative have separate content
ALTER TABLE programs ADD COLUMN IF NOT EXISTS team_type text DEFAULT 'intake';
-- All existing programs belong to intake team
UPDATE programs SET team_type = 'intake' WHERE team_type IS NULL;
