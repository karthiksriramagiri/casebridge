-- Add onboarding compliance fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nda_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nda_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS id_file_url text;

-- Create storage bucket for rep IDs (run this in Supabase Storage dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('rep-ids', 'rep-ids', false);
