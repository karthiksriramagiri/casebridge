-- Track all DocuSeal submissions sent through the dialer
CREATE TABLE IF NOT EXISTS public.dialer_docuseal_submissions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id   integer,
  template_id     integer NOT NULL,
  template_name   text,
  contact_id      text,
  contact_name    text NOT NULL,
  phone           text,
  email           text,
  firm            text,
  date_of_loss    text,
  date_of_birth   text,
  city_of_accident text,
  passenger_count integer NOT NULL DEFAULT 0,
  sent_by         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docuseal_submissions_contact ON public.dialer_docuseal_submissions (contact_id);
CREATE INDEX IF NOT EXISTS idx_docuseal_submissions_created ON public.dialer_docuseal_submissions (created_at DESC);
