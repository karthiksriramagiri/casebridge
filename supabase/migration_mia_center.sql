-- The MIA Center.
--
-- A case that signs and then goes quiet is the most expensive kind of lead
-- in the business: it has been paid for twice over — the ad that bought it
-- and the hour that closed it — and it is worth nothing until somebody gets
-- the person back on the phone. That chasing was happening in a spreadsheet
-- nobody could see, so two reps rang the same person and a third went
-- untouched for a week.
--
-- This is a board for it. Four columns, left to right, in the order the work
-- actually moves:
--
--   mia          gone quiet, nobody has reached them
--   reconnected  someone got through
--   confirmed    they confirmed they are still in
--   safe         signed paperwork is back, the case is secure
--
-- Admins put people on the board; any rep can move them. Deliberately not
-- derived from `ghl_leads`: a lead goes MIA for reasons the pipeline does not
-- record, and the admin putting it here is the signal, not a stage change.

create table if not exists public.mia_cases (
  id            uuid primary key default gen_random_uuid(),

  -- Who went quiet. Stored on the row rather than joined, because this board
  -- outlives any one source — a lead can be here before it exists anywhere
  -- else, and the name is what a rep searches by.
  name          text not null,
  phone         text,
  email         text,

  -- The firm whose case it is. Nullable: a lead can be on the board before
  -- anyone has worked out which firm it belongs to.
  firm_id       uuid references public.firms(id) on delete set null,

  -- The matching ghl_leads row, when there is one. Not a hard requirement
  -- and not a cascade: deleting a lead must not silently empty the board.
  lead_id       uuid,

  -- Which column it sits in: 'mia' | 'reconnected' | 'confirmed' | 'safe'.
  status        text not null default 'mia',

  -- Position within the column. Reordering writes this; a new card goes to
  -- the top of its column, which is where a fresh MIA belongs.
  sort_order    integer not null default 0,

  -- The rep chasing it. Nullable — an unclaimed card is a real state, and
  -- the board should show it as one rather than pretending someone owns it.
  owner_id      uuid references public.profiles(id) on delete set null,

  -- Who closed the case in the first place.
  --
  -- Kept because they get to call first: they are the one voice the person
  -- already agreed to, and a stranger ringing about a case they half
  -- remember signing is how a reconnect turns into a cancellation. Without
  -- it on the card, whoever picks the board up has no idea whose call it
  -- should be and rings it themselves.
  --
  -- Both forms, the same way the rest of the app reads a closer: the id is
  -- the reliable link and the text is what survives when the closer has no
  -- profile — a contractor, someone long gone, a case closed before the
  -- Team Center existed. Copied onto the row rather than joined through
  -- `lead_id`, because a card may have no lead at all and the question
  -- "who closed this" still has an answer.
  closer_id     uuid references public.profiles(id) on delete set null,
  closer        text,

  -- Why they went quiet, what was tried. Free text: this is a note between
  -- people, not a field anything computes on.
  note          text not null default '',

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- When it last changed column. The board sorts stale cards up: a card that
  -- has sat in `mia` for nine days is the one that needs a call.
  moved_at      timestamptz not null default now()
);

-- Added after the first version of this table. Safe to re-run; does nothing
-- on a database where the create above has just made them.
alter table public.mia_cases add column if not exists closer_id uuid references public.profiles(id) on delete set null;
alter table public.mia_cases add column if not exists closer    text;

create index if not exists mia_cases_status_idx on public.mia_cases (status, sort_order);
create index if not exists mia_cases_owner_idx  on public.mia_cases (owner_id);

-- Every move, kept.
--
-- The board answers "where is this case now"; this answers "who moved it and
-- when", which is the question asked the moment a case goes backwards. A
-- card dragged from `safe` back to `mia` is bad news and somebody will want
-- to know when it happened without taking anyone's word for it.
create table if not exists public.mia_case_events (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.mia_cases(id) on delete cascade,
  -- 'created' | 'moved' | 'claimed' | 'note' | 'edited'
  kind       text not null,
  from_status text,
  to_status   text,
  detail     text not null default '',
  actor_id   uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mia_case_events_case_idx on public.mia_case_events (case_id, created_at desc);

comment on table public.mia_cases is
  'The MIA board: signed cases that went quiet, moving mia → reconnected → confirmed → safe. Added by admins, worked by any rep.';
comment on table public.mia_case_events is
  'Audit trail for the MIA board — who moved which case, from where to where, and when.';
