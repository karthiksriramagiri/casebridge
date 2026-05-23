-- Store the closer name sent directly from GHL webhook payload
ALTER TABLE ghl_leads ADD COLUMN IF NOT EXISTS closer text;
