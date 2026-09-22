-- ============================================================
-- Venu v3 — tunable settings (scenario draw mix)
-- Run after migration_venu_v2.sql.
-- ============================================================

create table if not exists public.venu_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.venu_settings enable row level security;

-- Everyone signed in can read (the draw needs them); only the service role
-- writes, and the API behind it is admin-only.
create policy "Authenticated can read venu settings" on public.venu_settings
  for select using (auth.role() = 'authenticated');
create policy "Service role manages venu settings" on public.venu_settings
  for all using (true);
