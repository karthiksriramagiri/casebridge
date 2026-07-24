-- Add conference tracking columns to dialer_calls
alter table public.dialer_calls
  add column if not exists conference_sid text,
  add column if not exists rep_call_sid   text;

create index if not exists dialer_calls_conference_sid_idx on public.dialer_calls (conference_sid);
