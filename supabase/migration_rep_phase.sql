-- Add rep_phase column to profiles
-- 1 = Intro, 2 = Onboarding, 3 = Active
-- Admin sets this manually per rep; gates access to Performance, My Cases, Todos
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rep_phase integer NOT NULL DEFAULT 1;
