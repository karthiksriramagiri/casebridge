-- Link multiple signed PCs that belong to the same accident/vehicle
ALTER TABLE ghl_leads ADD COLUMN IF NOT EXISTS accident_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_ghl_leads_accident_group ON ghl_leads (accident_group_id) WHERE accident_group_id IS NOT NULL;
