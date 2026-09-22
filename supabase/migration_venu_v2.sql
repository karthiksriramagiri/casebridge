-- ============================================================
-- Venu v2 — setter track, practice/test modes, per-rep permissions
-- Run after migration_venu.sql.
-- ============================================================

-- Who is allowed into which track. Admins set these on /venu/admin.
alter table public.profiles add column if not exists venu_setter boolean not null default false;
alter table public.profiles add column if not exists venu_closer boolean not null default false;

-- Sessions are now driven by the Nuance Book, in one of two modes.
alter table public.venu_sessions add column if not exists mode  text not null default 'practice'; -- practice | test
alter table public.venu_sessions add column if not exists track text not null default 'setter';   -- setter | closer
alter table public.venu_sessions add column if not exists scenario_title text;
alter table public.venu_sessions add column if not exists scenario_category text;

-- phase/section came from the old five-section model and no longer apply.
alter table public.venu_sessions alter column phase   drop not null;
alter table public.venu_sessions alter column section drop not null;

-- Setter scoring is two dimensions: criteria qualification and empathy.
alter table public.venu_scores add column if not exists criteria_score integer; -- 0-100
alter table public.venu_scores add column if not exists empathy_score  integer; -- 0-100
alter table public.venu_scores add column if not exists nuance_caught  boolean;
alter table public.venu_scores add column if not exists mode  text;
alter table public.venu_scores add column if not exists track text;

create index if not exists idx_venu_sessions_mode on public.venu_sessions(track, mode, started_at desc);
