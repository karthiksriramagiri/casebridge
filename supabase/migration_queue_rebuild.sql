-- ─────────────────────────────────────────────────────────────────────────────
-- Queue rebuild.
--
-- Three things the new engine needs that the table cannot currently say:
--
--   lead_created_at   when the lead first arrived, which is what decides
--                     whether it is "fresh" and gets called every two hours.
--                     stage_changed_at cannot do this job: a lead bouncing
--                     between No Response and Follow Up would become fresh
--                     again every time it moved and never stop being chased.
--
--   callback_id       the link back to dialer_callbacks. A callback now
--                     reaches the rep as a queue row, and completing either
--                     side has to settle the other — otherwise the next plan
--                     mirrors the promise straight back in and the rep is
--                     told to make the same call again.
--
--   callback_context  the note the rep left when they made the promise, so
--                     whoever picks it up knows what was said.
--
-- Safe to run more than once. The engine works without it — nothing reads as
-- fresh and callbacks stay on their own page — so there is no window where
-- the floor is broken waiting for this.
--
-- If you have already run an earlier version of this file, run it again:
-- section 2 clears a backfill that was actively wrong.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.dialer_attempts
  add column if not exists lead_created_at  timestamptz,
  add column if not exists callback_id      uuid,
  add column if not exists callback_context text;

comment on column public.dialer_attempts.lead_created_at is
  'When the lead first arrived in GHL. Decides freshness: inside 48 hours it outranks everything and is called every 2 hours. Never reset by a stage move.';
comment on column public.dialer_attempts.callback_id is
  'The dialer_callbacks row this attempt mirrors. Completing one settles the other.';

-- ── 2. Freshness is left null until GHL says otherwise ──────────────────────
-- An earlier draft of this file seeded lead_created_at from stage_changed_at
-- and that was wrong in precisely the way the column exists to prevent: a
-- No Response lead that merely MOVED in the last two days came out looking
-- brand new. On the live queue it promoted 90 leads, 66 of them No Response,
-- straight to the top of the floor's list.
--
-- A null reads as "not fresh", which ranks the lead on its stage — the old
-- behaviour, and the safe one. The sync refreshes this column on every
-- existing row from the opportunity's own createdAt, so the real values
-- arrive on the next run and the queue heals itself within ten minutes.
--
-- Idempotent and safe to re-run after the bad backfill: it only clears
-- values that are indistinguishable from a stage timestamp, and the sync
-- puts the true value back.
update public.dialer_attempts
   set lead_created_at = null
 where lead_created_at is not null
   and lead_created_at = stage_changed_at
   and lower(stage_name) <> 'new lead';

-- ── 3. One queue row per callback ───────────────────────────────────────────
-- The mirror is driven by "is this callback already in the queue", and a
-- check-then-insert cannot win against two syncs running a few seconds
-- apart. The index is the only guard that race cannot cross.
create unique index if not exists dialer_attempts_callback_id_key
  on public.dialer_attempts (callback_id)
  where callback_id is not null;

-- ── 4. Indexes the new selection actually uses ──────────────────────────────
-- Every fill reads the whole pending pool for the day and sorts it in TS, so
-- this is the hot path and it is a plain two-column match.
create index if not exists dialer_attempts_plan_status_idx
  on public.dialer_attempts (plan_date, status);

-- Reclaiming what a rep holds, and counting it against their five.
create index if not exists dialer_attempts_buffered_for_idx
  on public.dialer_attempts (buffered_for)
  where status = 'buffered';

-- The lease reaper: find calls that were started and never finished.
create index if not exists dialer_attempts_lease_expiry_idx
  on public.dialer_attempts (lease_expires_at)
  where status = 'leased';

-- ── 5. New Lead becomes a callable stage ────────────────────────────────────
-- It was never in the queue's stage list, so a lead sitting in New Lead
-- reached no rep at all — it only became callable once something else moved
-- it to No Response. Four calls a day once it is past its fresh window.
insert into public.dialer_cadence_rules (stage_name, calls_per_day, enabled)
select 'New Lead', 4, true
where not exists (
  select 1 from public.dialer_cadence_rules where lower(stage_name) = 'new lead'
);

-- MIA is chased hardest of the settled stages: a signed case going dark is
-- money already booked and walking out.
update public.dialer_cadence_rules set calls_per_day = 6, enabled = true
 where lower(stage_name) = 'mia';
