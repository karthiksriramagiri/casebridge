-- Call checklist: stores checkbox responses per call
CREATE TABLE IF NOT EXISTS public.dialer_call_checklist (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid     text NOT NULL UNIQUE,
  contact_id   text NOT NULL,
  rep_identity text,
  checklist    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_checklist_contact ON public.dialer_call_checklist (contact_id);
