-- The last two things the Creative Center kept out of the database.
--
-- Run after migration_creative_board.sql.
--
--   creative_exclusions   Watch List Mode's "remove this one for today"
--   creative_notifications  the bell
--
-- Exclusions lived in localStorage. They survived a reload on the machine
-- that made them and nowhere else: Jason hid six ads on his laptop, opened
-- the same page on another screen, and all six were back. A dismissal is a
-- decision about the day's work, not a browser preference.
--
-- Notifications lived in React state, so the bell reset to its seed on every
-- reload — unread counts, and every notification raised since the tab
-- opened, gone.

create table if not exists public.creative_exclusions (
  id          uuid primary key default gen_random_uuid(),
  -- The Meta ad id. Not a foreign key: ads live in Meta.
  creative_id text not null,
  -- Pacific day, which is the day the team works to. Dismissals are cleared
  -- by the date rolling over rather than by anyone tidying up.
  excluded_on date not null,
  created_at  timestamptz not null default now(),
  created_by  text,
  unique (creative_id, excluded_on)
);

create index if not exists creative_exclusions_day_idx on public.creative_exclusions (excluded_on desc);

create table if not exists public.creative_notifications (
  id         uuid primary key default gen_random_uuid(),
  -- 'admin' | 'creative' — which side of the center it is addressed to.
  recipient  text not null,
  body       text not null,
  href       text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists creative_notifications_recipient_idx
  on public.creative_notifications (recipient, created_at desc);

comment on table public.creative_exclusions is
  'Watch List Mode dismissals, by Pacific day. Shared across everyone, cleared by the date rolling over.';
comment on table public.creative_notifications is
  'Creative Center bell. Persisted so unread state survives a reload.';
