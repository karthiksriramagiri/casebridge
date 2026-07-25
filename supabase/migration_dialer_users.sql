create table if not exists public.dialer_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  role          text not null default 'REP' check (role in ('REP', 'ADMIN')),
  twilio_identity text unique,
  active        boolean not null default true,
  created_at    timestamptz default now()
);
alter table public.dialer_users enable row level security;
create policy "service role full access" on public.dialer_users
  for all using (true) with check (true);
