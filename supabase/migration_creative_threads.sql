-- One day's kill list, one Slack thread. Same for the launch list.
--
-- Run after migration_creative_board.sql.
--
-- Jason posts "the kill list is ready" in the morning and whoever works the
-- account answers "done" an hour later. Those are two messages about one
-- piece of work, and as two separate posts in a busy channel they are two
-- things to match up by eye.
--
-- Threading the second under the first needs the timestamp of the first,
-- and that timestamp cannot live in the browser: Jason posts from his
-- machine and the K-Team answers from theirs. So it lives here, keyed by
-- the day and the board it belongs to.
--
--   ('2026-11-10', 'kill',   '1794354579.151719')
--   ('2026-11-10', 'launch', '1794354612.887001')

create table if not exists public.creative_day_threads (
  -- The Pacific day the list belongs to, which is the day the center works to.
  day        date not null,
  -- 'kill' | 'launch'. One thread each: they are different jobs, often done
  -- by different people, and merging them would bury one under the other.
  board      text not null,
  -- Slack's message timestamp, which doubles as the thread id.
  thread_ts  text not null,
  -- Which channel it was posted into, so a later reply cannot be addressed
  -- to a thread in a channel that has since been reconfigured.
  channel    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, board)
);

comment on table public.creative_day_threads is
  'Slack thread per day per board, so "the list is ready" and "the list is done" are one conversation rather than two messages posted hours apart by two different people.';
