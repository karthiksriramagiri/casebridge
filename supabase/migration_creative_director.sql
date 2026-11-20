-- ─────────────────────────────────────────────────────────────────────────────
-- Who a brief belongs to, when somebody has said so.
--
-- The board worked it out from the type: a relaunch and an image double down
-- are Jason's, everything else is Faisal's. That is a good default and a poor
-- rule — work gets handed over, and there was no way to record it, so a card
-- sat on the wrong board with no way to move it.
--
-- Null means "use the default", which is every row that exists today.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.creative_assignments
  add column if not exists director text;

comment on column public.creative_assignments.director is
  'Explicit owner: creative (Faisal) or admin (Jason). Null uses the type-based default.';
