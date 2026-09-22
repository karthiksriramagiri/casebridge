-- Intake fill jobs — tracks auto-fill runs for the /sendcase monitoring page
CREATE TABLE IF NOT EXISTS intake_fill_jobs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id    text NOT NULL UNIQUE,
  contact_name  text,
  firm          text,
  status        text NOT NULL DEFAULT 'pending',  -- pending | processing | completed | error | no_data
  fields_written  jsonb DEFAULT '{}',
  fields_skipped  jsonb DEFAULT '{}',
  fields_extracted jsonb DEFAULT '{}',
  flags         jsonb DEFAULT '[]',
  summary       text,
  error         text,
  scheduled_at  timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_fill_jobs_status ON intake_fill_jobs(status);
CREATE INDEX IF NOT EXISTS idx_intake_fill_jobs_scheduled ON intake_fill_jobs(status, scheduled_at)
  WHERE status = 'pending';
