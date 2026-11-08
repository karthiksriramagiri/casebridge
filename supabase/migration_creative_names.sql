-- The two names a brief produces.
--
-- Run after migration_creative_assignments.sql.
--
-- An assignment said what to make but not what to call it. The names were
-- worked out again by hand at launch, which is where a cut ends up in an ad
-- set that differs from the intended one by a segment, and the account stops
-- grouping the way the reports assume.
--
-- Both are generated from the brief's own fields and stored with it:
--
--   ad set    LHP | Broad | HYB | RIP | INV | 20260908 | B000108
--   creative  0908 | B000108_V1 | LHP | HYB | RIP | C6 | D10
--
-- A double down writes the ad set verbatim — it runs in the same ad set, so
-- a new name would create a second one — and steps the creative to _V2.

alter table public.creative_assignments
  add column if not exists adset_name    text,
  add column if not exists creative_name text,
  -- The offer segment, shared by both names: OG | RIP.
  add column if not exists offer         text,
  -- Campaign type: INV | VAR.
  add column if not exists campaign_type text;

comment on column public.creative_assignments.adset_name is
  'The ad set this cut runs in, named exactly. Copied verbatim on a double down.';
comment on column public.creative_assignments.creative_name is
  'What the finished cut is called. Steps a version on each double down.';
