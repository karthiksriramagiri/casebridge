-- Add team_type to profiles
-- Values: 'intake' (default) | 'creative'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_type text DEFAULT 'intake';
