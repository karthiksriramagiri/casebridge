-- The watch list, the kill list and the launch queue.
--
-- These three boards were the last part of the Creative Center still living
-- in React state. Every other surface got a table; these did not, so putting
-- an ad on the watch list, marking a kill done or confirming a launch lasted
-- exactly as long as the tab stayed open. A refresh reset them to empty and
-- the day's decisions were gone — including Watch List Mode removals, which
-- were supposed to hold until midnight.
--
-- One table per board rather than a single JSON blob: these are read and
-- written by two people at once during the ad meeting, and a blob makes the
-- last writer win over the whole day's work.

create table if not exists public.creative_watch (
  id          uuid primary key default gen_random_uuid(),
  -- The Meta ad id. Not a foreign key: ads live in Meta, and one being
  -- archived there must not delete the record that it was watched.
  creative_id text not null,
  watch_date  date not null,
  reason      text not null default '',
  -- 'WATCH' | 'KILL' — the call made on it, if one has been made.
  decision    text,
  /* Watch List Mode hides a creative for the rest of the day. It is a removal
     from today's list, not a decision about the ad, so it is recorded here
     rather than by deleting the row — the row is what makes it stay hidden
     after a reload. */
  removed     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- An ad appears on a given day's watch list once.
  unique (creative_id, watch_date)
);

create index if not exists creative_watch_date_idx on public.creative_watch (watch_date desc);

create table if not exists public.creative_kill (
  id          uuid primary key default gen_random_uuid(),
  creative_id text not null,
  added_at    date not null,
  reason      text not null default '',
  -- 'pending' | 'done'
  status      text not null default 'pending',
  done_at     date,
  -- 'kill' | 'fatigue'. A killed ad did not work; a fatigued ad worked and
  -- wore out. Same action in Ads Manager, opposite meaning afterwards.
  kind        text not null default 'kill',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (creative_id, added_at)
);

create index if not exists creative_kill_status_idx on public.creative_kill (status, added_at desc);

create table if not exists public.creative_launches (
  id                 uuid primary key default gen_random_uuid(),
  assignment_id      uuid,
  source_creative_id text,
  name               text not null default '',
  angle              text not null default '',
  campaign           text not null default '',
  convention         text not null default '',
  -- { resize, disclaimer, asIs } — read and written whole, never queried into.
  tags               jsonb not null default '{}'::jsonb,
  launch_date        date not null,
  daily_budget       numeric not null default 0,
  -- 'pending' | 'done' | 'cancelled'
  status             text not null default 'pending',
  done_at            date,
  is_new_test_batch  boolean not null default false,
  -- 'assignment' | 'manual' | 'relaunch'
  requested_by       text not null default 'manual',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists creative_launches_date_idx on public.creative_launches (launch_date desc);

comment on table public.creative_watch is
  'Creative Center watch list, by day. `removed` is a Watch List Mode hide, not a decision.';
comment on table public.creative_kill is
  'Creative Center kill list. kind=fatigue means it worked and wore out.';
comment on table public.creative_launches is
  'Creative Center launch queue — what is going live, and what went live when.';
