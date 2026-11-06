-- Assignments, production tasks and their conversation.
--
-- The Creative Center's boards have run on in-memory seed data: every brief,
-- comment and upload vanished on reload, which makes the board a mockup
-- rather than a place work actually lives. These tables make it real.
--
-- Three tables, because the board has three kinds of row:
--
--   creative_assignments  the brief Jason sends Faisal, and its status
--   creative_tasks        Jason's own production queue (disclaimer, resize…)
--   creative_comments     the conversation hanging off either of them
--
-- Attachments ride on the assignment row as JSON rather than in a table of
-- their own: they are always read with their assignment, never queried across
-- assignments, and the file itself lives in storage.

create table if not exists public.creative_assignments (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  type         text not null,
  angle        text not null default '',
  status       text not null default 'Assigned',
  notes        text not null default '',
  -- Which ad this was built from, as a Meta ad id. Not a foreign key: ads
  -- live in Meta, not here, and an ad being archived must not delete the
  -- assignment that came from it.
  source_ad_id text,
  benchmark_url text,
  -- Position inside its status column on the board.
  sort_order   integer not null default 0,
  attachments  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   text
);

comment on table public.creative_assignments is
  'Creative Team assignments — the briefs on the Creative Center board.';

create table if not exists public.creative_tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  type         text not null,
  status       text not null default 'To Do',
  notes        text not null default '',
  disclaimer   text,
  source_ad_id text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_at      timestamptz,
  created_by   text
);

comment on table public.creative_tasks is
  'Production tasks — resize, disclaimer, translate, naming. Formerly the K-Team board.';

-- One comment table for both boards. `parent_kind` says which, so a thread
-- cannot be orphaned by pointing at the wrong table.
create table if not exists public.creative_comments (
  id          uuid primary key default gen_random_uuid(),
  parent_kind text not null check (parent_kind in ('assignment', 'task')),
  parent_id   uuid not null,
  author      text not null,
  text        text not null,
  created_at  timestamptz not null default now()
);

comment on table public.creative_comments is
  'Feedback thread on an assignment or a production task.';

create index if not exists creative_assignments_status_idx on public.creative_assignments (status, sort_order);
create index if not exists creative_tasks_status_idx       on public.creative_tasks (status, sort_order);
create index if not exists creative_comments_parent_idx    on public.creative_comments (parent_kind, parent_id, created_at);

-- Keep updated_at honest without every caller having to remember it.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists creative_assignments_touch on public.creative_assignments;
create trigger creative_assignments_touch before update on public.creative_assignments
  for each row execute function public.touch_updated_at();

drop trigger if exists creative_tasks_touch on public.creative_tasks;
create trigger creative_tasks_touch before update on public.creative_tasks
  for each row execute function public.touch_updated_at();

alter table public.creative_assignments enable row level security;
alter table public.creative_tasks       enable row level security;
alter table public.creative_comments    enable row level security;

-- Read and written through the service role from the Creative Center's own
-- routes, which authenticate with the casebridge_session cookie. No anon
-- policy is wanted: without one, RLS denies everything that is not the
-- service key, which is the intent.

-- ─── Brief fields ────────────────────────────────────────────────────────────
--
-- A brief now carries everything the resulting ad's name needs, so the person
-- building it is not guessing which firm, format or hooks were meant:
--
--   0826 | B00090_BNR1 | LHP | BNR | G1 | H4 | GA-WIN
--    ^^^^                 ^^^   ^^^  ^^   ^^
--   batch                firm  format vis verb
--
-- Added separately from the create above so a database that already ran the
-- first half of this file picks them up without being dropped and rebuilt.

alter table public.creative_assignments add column if not exists firm           text;
alter table public.creative_assignments add column if not exists format         text;
alter table public.creative_assignments add column if not exists visual_code    text;
alter table public.creative_assignments add column if not exists verbal_code    text;
alter table public.creative_assignments add column if not exists batch          text;
alter table public.creative_assignments add column if not exists benchmark_name text;

-- Hook codes are one letter and a number — A3, B13, G1. Checked here so a bad
-- code cannot reach the angle reports, which join on exactly this shape.
alter table public.creative_assignments drop constraint if exists creative_assignments_visual_code_shape;
alter table public.creative_assignments add constraint creative_assignments_visual_code_shape
  check (visual_code is null or visual_code ~ '^[ACEGIK][0-9]{1,3}$');

alter table public.creative_assignments drop constraint if exists creative_assignments_verbal_code_shape;
alter table public.creative_assignments add constraint creative_assignments_verbal_code_shape
  check (verbal_code is null or verbal_code ~ '^[BDFHJL][0-9]{1,3}$');

create index if not exists creative_assignments_firm_idx on public.creative_assignments (firm);

-- Benchmark creatives are uploaded, not linked. Public read so the board can
-- render a thumbnail without signing every URL; writes go through the service
-- role from the Creative Center's own upload route.
insert into storage.buckets (id, name, public)
values ('creative-benchmarks', 'creative-benchmarks', true)
on conflict (id) do nothing;

-- Priority: 1 to 5 stars, 5 being most urgent. Defaulted to the middle so an
-- existing brief is neither shouted about nor buried when the column lands.
alter table public.creative_assignments add column if not exists priority integer not null default 3;

alter table public.creative_assignments drop constraint if exists creative_assignments_priority_range;
alter table public.creative_assignments add constraint creative_assignments_priority_range
  check (priority between 1 and 5);

-- The board reads priority-first inside each status column.
create index if not exists creative_assignments_priority_idx
  on public.creative_assignments (status, priority desc, sort_order);

-- The script the cut should use, handed over with the brief.
alter table public.creative_assignments add column if not exists script text;

-- Which version a comment is feedback on: v1, v2, final, or null for general
-- chat. Stored on the comment rather than in a separate table because a
-- thread is always read with its assignment.
alter table public.creative_comments add column if not exists stage text;

alter table public.creative_comments drop constraint if exists creative_comments_stage_shape;
alter table public.creative_comments add constraint creative_comments_stage_shape
  check (stage is null or stage in ('v1', 'v2', 'final'));

-- Creative uploads live in their own bucket, separate from benchmarks: a
-- benchmark is a reference someone else made, these are the work itself.
insert into storage.buckets (id, name, public)
values ('creative-uploads', 'creative-uploads', true)
on conflict (id) do nothing;

-- ─── Production tasks carry the same brief fields ────────────────────────────
--
-- A task ends up as an ad with the same name an assignment does, so it needs
-- the same pieces. Same columns, same shapes, same constraints.

alter table public.creative_tasks add column if not exists firm           text;
alter table public.creative_tasks add column if not exists format         text;
alter table public.creative_tasks add column if not exists visual_code    text;
alter table public.creative_tasks add column if not exists verbal_code    text;
alter table public.creative_tasks add column if not exists batch          text;
alter table public.creative_tasks add column if not exists priority       integer not null default 3;
alter table public.creative_tasks add column if not exists script         text;
alter table public.creative_tasks add column if not exists benchmark_url  text;
alter table public.creative_tasks add column if not exists benchmark_name text;
alter table public.creative_tasks add column if not exists attachments    jsonb not null default '[]'::jsonb;

alter table public.creative_tasks drop constraint if exists creative_tasks_visual_code_shape;
alter table public.creative_tasks add constraint creative_tasks_visual_code_shape
  check (visual_code is null or visual_code ~ '^[ACEGIK][0-9]{1,3}$');

alter table public.creative_tasks drop constraint if exists creative_tasks_verbal_code_shape;
alter table public.creative_tasks add constraint creative_tasks_verbal_code_shape
  check (verbal_code is null or verbal_code ~ '^[BDFHJL][0-9]{1,3}$');

alter table public.creative_tasks drop constraint if exists creative_tasks_priority_range;
alter table public.creative_tasks add constraint creative_tasks_priority_range
  check (priority between 1 and 5);

create index if not exists creative_tasks_priority_idx
  on public.creative_tasks (status, priority desc, sort_order);
