-- GHL API call accounting, to find what is burning the 200k/day location quota.
-- The quota is metered per LOCATION (a second API token shares the same bucket),
-- so the only fix is lowering total volume — which first requires knowing who
-- is spending it.

create table if not exists ghl_call_counts (
  day        date        not null,
  source     text        not null,   -- calling file, from the stack at call time
  n          bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, source)
);

create index if not exists ghl_call_counts_day_idx on ghl_call_counts (day desc, n desc);

-- Atomic increment so concurrent lambdas can't clobber each other.
create or replace function ghl_call_bump(p_day date, p_source text, p_n int)
returns void
language sql
as $$
  insert into ghl_call_counts (day, source, n, updated_at)
  values (p_day, p_source, p_n, now())
  on conflict (day, source)
  do update set n = ghl_call_counts.n + excluded.n, updated_at = now();
$$;

-- Read the damage:
--   select source, n from ghl_call_counts
--   where day = current_date order by n desc limit 20;
