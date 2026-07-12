-- Add replaced and payment_cleared status columns to oos_cases
ALTER TABLE oos_cases
  ADD COLUMN IF NOT EXISTS replaced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_cleared boolean NOT NULL DEFAULT false;
