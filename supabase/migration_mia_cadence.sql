-- Add MIA cadence rule: 6 calls per day
INSERT INTO dialer_cadence_rules (stage_name, calls_per_day) VALUES
  ('MIA', 6)
ON CONFLICT (stage_name) DO UPDATE SET calls_per_day = 6;
