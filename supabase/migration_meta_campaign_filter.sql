-- Add meta_campaign_filter to firms
-- When set, only campaigns/adsets/creatives whose name contains this string are shown

ALTER TABLE firms ADD COLUMN IF NOT EXISTS meta_campaign_filter text;

-- Set LHP to use the shared Meta account with "LHP" campaign filter
UPDATE firms
SET
  meta_account_id = 'act_788484706914452',
  meta_campaign_filter = 'LHP'
WHERE slug = 'lhp';
