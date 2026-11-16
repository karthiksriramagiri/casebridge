-- ─────────────────────────────────────────────────────────────────────────────
-- One callback per GHL task.
--
-- Two webhooks create callbacks from the same GHL task — /webhooks/ghl/task
-- and /webhooks/ghl/callback — and only the first checked whether one
-- already existed. GHL fires both, about two seconds apart, so very nearly
-- every task produced two callbacks: 146 of the last ~150 task ids appear
-- twice, and the floor saw two identical "Dialer Callback in 5 Minutes"
-- messages for one call.
--
-- Application-side checking cannot fix this on its own. Two requests two
-- seconds apart both read "no callback exists" before either writes, so the
-- guard has to live where the race cannot reach it: a unique index.
--
-- Run this once. It de-duplicates what is already there, then makes the
-- duplicate impossible.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Collapse existing duplicates ─────────────────────────────────────────
-- The oldest row of each task wins. It is the one the floor has been
-- reacting to — notifications, claims and completions hang off it — so
-- keeping the newer one would quietly discard that history.
with ranked as (
  select id,
         ghl_task_id,
         row_number() over (
           partition by ghl_task_id
           order by created_at asc, id asc
         ) as rn
  from public.dialer_callbacks
  where ghl_task_id is not null
)
delete from public.dialer_callbacks c
using ranked r
where c.id = r.id
  and r.rn > 1
  -- Never delete a callback somebody already acted on. If both copies were
  -- worked, that is worth seeing rather than silently resolving.
  and c.status = 'pending'
  and c.completed_at is null;

-- ── 2. Make it impossible ───────────────────────────────────────────────────
-- Partial, because a callback created by hand in the dialer has no task id
-- and any number of those may exist.
create unique index if not exists dialer_callbacks_ghl_task_id_key
  on public.dialer_callbacks (ghl_task_id)
  where ghl_task_id is not null;

comment on index public.dialer_callbacks_ghl_task_id_key is
  'One callback per GHL task. Two webhooks race to create them; this is the only guard that race cannot cross.';
