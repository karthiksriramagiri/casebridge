-- Add case_count and fee_rate columns to firm_invoices
ALTER TABLE firm_invoices ADD COLUMN IF NOT EXISTS case_count integer;
ALTER TABLE firm_invoices ADD COLUMN IF NOT EXISTS fee_rate numeric;

-- Create LHP Invoice 4
INSERT INTO firm_invoices (firm_id, code, title, period_start, period_end, sort_order, case_count, fee_rate)
SELECT f.id, 'INV-4', 'Invoice 4', '2026-06-18', '2026-12-31', 4, 30, 0.03
FROM firms f
WHERE f.slug = 'lhp'
ON CONFLICT (firm_id, code) DO NOTHING;
