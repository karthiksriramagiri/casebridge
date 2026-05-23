-- Invoice billing periods + ops expense attribution (run after migration_kpi / firm PCS migration)
-- If the app shows "firm_invoices" / "schema cache": paste this whole file into Supabase → SQL Editor → Run.
-- Then wait ~1 minute or reload the project so the API schema cache refreshes.
-- Adjust period_start / period_end to match your spreadsheet invoice tabs.

CREATE TABLE IF NOT EXISTS public.firm_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (firm_id, code)
);

CREATE INDEX IF NOT EXISTS idx_firm_invoices_firm ON public.firm_invoices(firm_id, sort_order);

ALTER TABLE public.ops_expenses
  ADD COLUMN IF NOT EXISTS invoice_code text;

CREATE INDEX IF NOT EXISTS idx_ops_expenses_invoice ON public.ops_expenses(firm_id, invoice_code);

-- MCA invoice windows (align with your Google Sheet invoice tabs / P&L cycles — edit dates as needed)
INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-1', 'Invoice 1', '2026-02-28', '2026-03-18', 1 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO UPDATE SET
  title = EXCLUDED.title,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-2', 'Invoice 2', '2026-03-19', '2026-04-12', 2 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO UPDATE SET
  title = EXCLUDED.title,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.firm_invoices (firm_id, code, title, period_start, period_end, sort_order)
SELECT f.id, 'INV-3', 'Invoice 3', '2026-04-13', '2026-12-31', 3 FROM public.firms f WHERE f.slug = 'mca'
ON CONFLICT (firm_id, code) DO UPDATE SET
  title = EXCLUDED.title,
  period_start = EXCLUDED.period_start,
  period_end = EXCLUDED.period_end,
  sort_order = EXCLUDED.sort_order;

-- Tag historical ops expenses into the invoice whose period contains expense.date (unassigned rows only)
UPDATE public.ops_expenses e
SET invoice_code = fi.code
FROM public.firm_invoices fi
JOIN public.firms f ON f.id = fi.firm_id AND f.slug = 'mca'
WHERE e.invoice_code IS NULL
  AND e.date BETWEEN fi.period_start AND fi.period_end
  AND (e.firm_id IS NULL OR e.firm_id = f.id);
