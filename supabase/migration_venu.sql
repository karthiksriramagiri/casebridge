-- ============================================================
-- Venu — AI caller training & coaching
-- The roleplay bot reps talk to is named Venu.
-- Run in the Supabase SQL editor.
-- ============================================================

-- One row per roleplay session (or, later, per scored real call).
create table if not exists public.venu_sessions (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete set null,
  rep_name      text default '',
  scenario_id   text not null,
  phase         text not null,               -- '1' (setter) | '2' (closer)
  section       text not null,               -- '1A' | '1B' | '2A' | '2B' | '2C'
  difficulty    integer default 1,
  source        text not null default 'roleplay',  -- roleplay | live_call
  status        text not null default 'live',      -- live | scoring | scored | abandoned
  end_reason    text,                        -- signed | hung_up | max_turns | ended_by_rep | error
  started_at    timestamptz default now(),
  ended_at      timestamptz,
  duration_sec  integer,
  transcript    jsonb default '[]'::jsonb,   -- [{ speaker, text, startMs, endMs }]
  metrics       jsonb default '{}'::jsonb,   -- timing/pacing metrics (see _lib/metrics.ts)
  created_at    timestamptz default now()
);

-- One scorecard per session.
create table if not exists public.venu_scores (
  id               uuid default gen_random_uuid() primary key,
  session_id       uuid references public.venu_sessions(id) on delete cascade unique,
  user_id          uuid references auth.users(id) on delete set null,
  overall_score    integer,                  -- 1-100
  empathy          integer,                  -- 1-10
  decisiveness     integer,                  -- 1-10
  quick_thinking   integer,                  -- 1-10
  coaching_summary text,
  scorecard        jsonb default '{}'::jsonb, -- full structured scorecard
  created_at       timestamptz default now()
);

create index if not exists idx_venu_sessions_user    on public.venu_sessions(user_id, started_at desc);
create index if not exists idx_venu_sessions_section on public.venu_sessions(section, started_at desc);
create index if not exists idx_venu_scores_user      on public.venu_scores(user_id, created_at desc);

alter table public.venu_sessions enable row level security;
alter table public.venu_scores   enable row level security;

-- Reps read their own; admins read everything. All writes go through the
-- service role in /api/venu/*, which bypasses RLS.
create policy "Users read own venu sessions" on public.venu_sessions
  for select using (auth.uid() = user_id);
create policy "Admins read all venu sessions" on public.venu_sessions
  for select using (public.is_admin());
create policy "Service role manages venu sessions" on public.venu_sessions
  for all using (true);

create policy "Users read own venu scores" on public.venu_scores
  for select using (auth.uid() = user_id);
create policy "Admins read all venu scores" on public.venu_scores
  for select using (public.is_admin());
create policy "Service role manages venu scores" on public.venu_scores
  for all using (true);
