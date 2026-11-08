-- One frozen copy of the Meta numbers per working day.
--
-- Every Creative Center page reads one live call to Meta, so yesterday's
-- view was never yesterday's view: the watch list, the kill list and the
-- launch queue were all dated and stored, but the CPLs, spend and budgets
-- beside them were always today's. Stepping the day nav back showed last
-- week's decisions against this morning's numbers, which is the one thing
-- you cannot reason from — you could not see what the room was actually
-- looking at when it made the call.
--
-- So the day's numbers are written down the first time the center is opened
-- on that day, and that copy is what every page reads for the rest of it.
-- Past days are never rewritten. Today can be re-taken on demand (the
-- refresh button), which is the only write that ever replaces a row.
--
-- One row per Pacific day, which is the day the team works to — the same
-- boundary the watch and kill lists already use, so a day's numbers and a
-- day's decisions start and end together.

create table if not exists public.creative_day_snapshot (
  -- Pacific day. Primary key: a day has exactly one set of numbers.
  day        date primary key,
  -- The whole /api/creative/center/creatives response: every ad, its daily
  -- series over the lookback window, its ad set budget and switched-on
  -- state. jsonb rather than a table per field because nothing queries
  -- inside it — it is read back whole and handed to the client as-is.
  payload    jsonb not null,
  -- For the "taken at 06:12, 171 ads" line on the locked-day banner, so the
  -- page can say how old the numbers are without parsing the blob.
  ad_count   int not null default 0,
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists creative_day_snapshot_day_idx
  on public.creative_day_snapshot (day desc);
