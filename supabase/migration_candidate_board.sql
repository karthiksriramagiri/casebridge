-- Candidate board — the onboarding pipeline for new reps.
--
-- One column on profiles holds where a rep sits between credentials being
-- created and going live. Null means nobody has moved them yet, which the
-- board reads as the first stage, so existing reps appear without a backfill.
--
-- Two of the stages move themselves: booking the call advances a rep to
-- booked_call, and starting module 2 advances them to nuance_book. Those
-- writes only ever move a rep forward (see the guards in the API routes), so
-- an admin who has dragged someone further along never gets overruled by a
-- late automation.

alter table public.profiles
  add column if not exists candidate_stage text;

comment on column public.profiles.candidate_stage is
  'Onboarding board stage: credentials_created | booked_call | nuance_book | call_practice | exam_prep | ready_kickoff | live. Null = credentials_created.';

-- Ordering within a column, sparse so a drop between two cards rewrites one row.
alter table public.profiles
  add column if not exists candidate_position integer;

create index if not exists profiles_candidate_stage_idx
  on public.profiles (candidate_stage)
  where candidate_stage is not null;
