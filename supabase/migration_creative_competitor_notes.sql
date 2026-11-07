-- Competitor notes, by day.
--
-- There was one note per competitor, overwritten every time anyone typed —
-- which meant the Creative Team had nothing to read before doing their own
-- pass. A note is an observation made on a day ("they switched to banner
-- hooks this week"), and the value is in the sequence, not the latest state.
--
-- One row per competitor per day. Writing the same day again replaces that
-- day's note rather than adding a second one, because that is what editing
-- today's entry means.

create table if not exists public.creative_competitor_notes (
  id          uuid primary key default gen_random_uuid(),
  competitor  text not null,
  note_date   date not null,
  body        text not null default '',
  author      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.creative_competitor_notes is
  'Dated competitor observations — the Creative Team reads back before its own analysis.';

-- One note per competitor per day, so an edit updates rather than appends.
create unique index if not exists creative_competitor_notes_unique
  on public.creative_competitor_notes (competitor, note_date);

-- The page reads newest first for one competitor at a time.
create index if not exists creative_competitor_notes_recent
  on public.creative_competitor_notes (competitor, note_date desc);

drop trigger if exists creative_competitor_notes_touch on public.creative_competitor_notes;
create trigger creative_competitor_notes_touch before update on public.creative_competitor_notes
  for each row execute function public.touch_updated_at();

alter table public.creative_competitor_notes enable row level security;

-- Read and written through the service role from the Creative Center's own
-- route, which authenticates with the casebridge_session cookie.
