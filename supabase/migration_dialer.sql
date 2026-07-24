-- ============================================================
-- Dialer: calls + transcripts
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists public.dialer_calls (
  call_sid        text primary key,                -- Twilio CallSid
  contact_id      text,                            -- GHL contact ID
  contact_name    text,
  phone           text,
  rep_identity    text,                            -- Twilio client identity (e.g. "karthik")
  campaign_id     text,                            -- our firmSlug:stageId
  pipeline_id     text,
  stage_id        text,
  firm            text,
  stage_name      text,
  direction       text default 'outbound',
  call_status     text,                            -- completed / no-answer / busy / failed
  duration        integer,                         -- seconds
  disposition     text,                            -- Qualified / No Answer / etc
  recording_url   text,
  recording_sid   text,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz default now()
);

create index if not exists dialer_calls_contact_id on public.dialer_calls(contact_id);
create index if not exists dialer_calls_created_at on public.dialer_calls(created_at desc);

create table if not exists public.dialer_transcripts (
  id              uuid primary key default gen_random_uuid(),
  call_sid        text references public.dialer_calls(call_sid) on delete cascade,
  contact_id      text,
  provider        text default 'deepgram',
  status          text default 'pending',          -- pending / completed / failed
  request_id      text,                            -- Deepgram request ID
  full_text       text,                            -- plain concatenated transcript
  summary         text,                            -- Deepgram summarize=v2 short summary
  utterances      jsonb,                           -- [{start, end, channel, speaker, transcript}]
  raw             jsonb,                           -- full provider response
  created_at      timestamptz default now(),
  completed_at    timestamptz
);

create index if not exists dialer_transcripts_call_sid   on public.dialer_transcripts(call_sid);
create index if not exists dialer_transcripts_contact_id on public.dialer_transcripts(contact_id);

-- Enable RLS (service role bypasses it)
alter table public.dialer_calls       enable row level security;
alter table public.dialer_transcripts enable row level security;
