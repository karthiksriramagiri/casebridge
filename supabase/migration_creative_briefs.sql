-- ============================================================
-- Creative briefs — the Assignments board in the Creative Center.
-- A Notion-style database: one row per brief, moved across the
-- production pipeline from Assigned through to Winner.
-- ============================================================

create table if not exists public.creative_briefs (
  id           uuid primary key default gen_random_uuid(),

  title        text not null,

  -- Pipeline column. Kept as text rather than an enum so adding a stage is a
  -- one-line change here and in the UI's STATUSES list, not a type migration.
  status       text not null default 'assigned',
    -- assigned | in_progress | feedback_process | feedback_done
    -- | ready_to_launch | ad_launched | winner

  -- Ad family, matching the angle taxonomy already used on /creative/angles:
  -- BR | HYB | UGC | BNR | ANM | IMG
  ad_type      text,

  -- English and Spanish creative run as separate boards, the way they do in
  -- Notion today. One table, one filter.
  language     text not null default 'english',   -- english | spanish

  assignee_id  uuid references public.profiles(id) on delete set null,
  due_date     date,
  must_launch  boolean not null default false,

  benchmark_url   text,       -- the reference cut this brief is made against
  benchmark_name  text,       -- original filename, or a label for a link
  benchmark_kind  text,       -- link | upload

  brief        text,          -- the ask: structure, script, reference
  deliverable_url text,       -- what the creative rep hands back
  launched_ad_id  text,       -- Meta ad id once it ships, closing the loop
                              -- back onto real CPL/CPA for this brief

  -- Manual ordering inside a column. Sparse integers (1000, 2000, …) so a
  -- card can be dropped between two neighbours without renumbering the rest.
  position     integer not null default 1000,

  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_creative_briefs_board
  on public.creative_briefs (language, status, position);

create index if not exists idx_creative_briefs_assignee
  on public.creative_briefs (assignee_id, status);

create index if not exists idx_creative_briefs_launched_ad
  on public.creative_briefs (launched_ad_id)
  where launched_ad_id is not null;

-- ── Comments ────────────────────────────────────────────────────────────────
-- The feedback loop: the Feedback Process column is where these accumulate,
-- so the card's comment count is the signal that a brief needs attention.

create table if not exists public.creative_brief_comments (
  id         uuid primary key default gen_random_uuid(),
  brief_id   uuid not null references public.creative_briefs(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  author_name text,           -- denormalised so a deleted profile keeps its history
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_creative_brief_comments_brief
  on public.creative_brief_comments (brief_id, created_at);

-- ── updated_at ──────────────────────────────────────────────────────────────

create or replace function public.touch_creative_brief()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_creative_briefs_touch on public.creative_briefs;
create trigger trg_creative_briefs_touch
  before update on public.creative_briefs
  for each row execute function public.touch_creative_brief();

-- ── Benchmark reference ─────────────────────────────────────────────────────
-- The reference cut a brief is being made against — "make it like this".
-- Either a pasted link (Meta Ad Library, TikTok, Drive) or an uploaded file
-- living in the `creative-benchmarks` storage bucket.
-- Stated as ALTERs as well as in the table above so re-running this file on a
-- database that already has creative_briefs picks the columns up.

alter table public.creative_briefs add column if not exists benchmark_url  text;
alter table public.creative_briefs add column if not exists benchmark_name text;
alter table public.creative_briefs add column if not exists benchmark_kind text;  -- link | upload

-- Storage bucket for uploaded benchmark videos. Private: the board already
-- sits behind the Creative Center session, and signed URLs are issued by the
-- upload route.
insert into storage.buckets (id, name, public)
values ('creative-benchmarks', 'creative-benchmarks', false)
on conflict (id) do nothing;
