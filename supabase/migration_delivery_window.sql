-- How many days the firm has to deliver leads from invoice period_start
ALTER TABLE firms ADD COLUMN IF NOT EXISTS delivery_window_days integer DEFAULT 30;

UPDATE firms SET delivery_window_days = 30 WHERE slug = 'lhp';
UPDATE firms SET delivery_window_days = 30 WHERE slug = 'mca';
