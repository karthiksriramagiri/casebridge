-- ============================================================
-- Competitor ad intelligence — the Competitors tab.
-- One row per ad analysed (ours or a competitor's), one row per
-- generated report. Scorecards are stored as jsonb so the taxonomy
-- can grow without a migration per field.
-- ============================================================

create table if not exists public.competitor_ads (
  id uuid primary key default gen_random_uuid(),

  -- "ours" rows are our own creative, analysed with the identical pipeline so
  -- the gap analysis compares like with like.
  source_type text not null default 'competitor',   -- competitor | ours
  brand_name  text,
  label       text,                                 -- human name for the ad

  video_url       text,        -- direct video URL, or a signed URL for an upload
  ad_library_url  text,
  video_path      text,        -- storage path when uploaded rather than linked

  -- Ad Library metadata. run_days is the strongest public signal that a
  -- creative is working — nobody keeps paying for an ad that does not.
  first_seen  date,
  run_days    integer,

  duration_seconds numeric,
  aspect_ratio     text,

  -- Pipeline state, so a batch can be resumed rather than restarted.
  status text not null default 'new',
    -- new | transcribing | transcribed | analyzing | scored | failed
  error  text,

  transcript      text,
  transcript_json jsonb,       -- Deepgram payload incl. word-level timings
  has_audio       boolean,

  frames_count integer not null default 0,

  scorecard        jsonb,      -- the Section 6 scorecard
  taxonomy_version text,       -- refuse to mix versions in one comparison

  batch      text,             -- groups ads analysed together
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_competitor_ads_batch
  on public.competitor_ads (batch, source_type);
create index if not exists idx_competitor_ads_status
  on public.competitor_ads (status);

-- Sampled frames. Kept out of the ad row: a 30-frame timeline is large and is
-- only needed while scoring, never when listing the board.
create table if not exists public.competitor_ad_frames (
  id       uuid primary key default gen_random_uuid(),
  ad_id    uuid not null references public.competitor_ads(id) on delete cascade,
  t_seconds numeric not null,
  path     text not null,      -- storage path in competitor-ads bucket
  created_at timestamptz not null default now()
);

create index if not exists idx_competitor_ad_frames_ad
  on public.competitor_ad_frames (ad_id, t_seconds);

-- Generated reports, kept so a framework can be referenced later and so the
-- team can see what the recommendation looked like before the creative ran.
create table if not exists public.competitor_reports (
  id uuid primary key default gen_random_uuid(),
  batch      text,
  title      text,
  report     jsonb not null,   -- summary, tables, gaps, framework, suggestions
  ad_ids     uuid[],
  taxonomy_version text,
  created_at timestamptz not null default now()
);

create index if not exists idx_competitor_reports_batch
  on public.competitor_reports (batch, created_at desc);

-- ── updated_at ──────────────────────────────────────────────────────────────

create or replace function public.touch_competitor_ad()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_competitor_ads_touch on public.competitor_ads;
create trigger trg_competitor_ads_touch
  before update on public.competitor_ads
  for each row execute function public.touch_competitor_ad();

-- Private bucket for uploaded competitor videos and sampled frames.
insert into storage.buckets (id, name, public)
values ('competitor-ads', 'competitor-ads', false)
on conflict (id) do nothing;
