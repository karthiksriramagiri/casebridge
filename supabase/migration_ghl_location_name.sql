-- Stores the exact GHL location name sent in webhooks for firm matching
ALTER TABLE firms ADD COLUMN IF NOT EXISTS ghl_location_name text;

UPDATE firms SET ghl_location_name = 'Larry H. Parker' WHERE slug = 'lhp';
UPDATE firms SET ghl_location_name = 'Georgia-MCA'     WHERE slug = 'mca';
