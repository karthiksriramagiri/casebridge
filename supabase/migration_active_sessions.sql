create table if not exists public.dialer_active_sessions (
  rep_identity      text primary key,
  conference_name   text not null,
  conference_sid    text,
  rep_call_sid      text,
  customer_call_sid text,
  customer_phone    text,
  contact_id        text,
  contact_name      text,
  firm              text,
  campaign          text,
  started_at        timestamptz default now()
);
alter table public.dialer_active_sessions enable row level security;
create policy "service role full access" on public.dialer_active_sessions
  for all using (true) with check (true);

create table if not exists public.dialer_rep_status (
  rep_identity  text primary key,
  status        text not null default 'OFFLINE',
  updated_at    timestamptz default now()
);
alter table public.dialer_rep_status enable row level security;
create policy "service role full access" on public.dialer_rep_status
  for all using (true) with check (true);
