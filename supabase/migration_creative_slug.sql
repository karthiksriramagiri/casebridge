-- Adds creative_slug to profiles for creative reps (e.g. 'OGF' for Faisal)
-- Used to attribute signed cases to the creative rep whose ad produced them
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS creative_slug text;
