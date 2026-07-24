-- AI summaries per contact (one row per lead, updated after each new call/message)
create table if not exists public.dialer_ai_summaries (
  contact_id  text primary key,
  summary     text,
  updated_at  timestamptz default now()
);

alter table public.dialer_ai_summaries enable row level security;
