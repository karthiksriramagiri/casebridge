-- Which ad account a brief launches into.
--
-- Run after migration_creative_assignments.sql.
--
-- Jacoby & Meyers now runs in both Meta accounts — Accident Support Desk and
-- Collision Support Desk — so the firm alone no longer says which board a
-- brief belongs on, or which account the person launching it has to be
-- sitting in. The two accounts are separate lists everywhere in the Creative
-- Center, and this is the column that tells them apart.
--
-- Deliberately NOT folded into `firm`. The firm column is what the generated
-- ad name is built from (… | JM | …), and an account suffix in there would
-- end up in the ad name itself. The account is a fact about where the ad
-- goes, not about what it is called.
--
-- Null means "not recorded", which is every brief raised before the second
-- account existed and every brief for a firm that only runs in one. The
-- boards read it as the firm's single lane rather than as an error.

alter table public.creative_assignments
  add column if not exists account text;

alter table public.creative_tasks
  add column if not exists account text;

-- The launch list and the ad meeting both read a day one lane at a time, so
-- the day and the account are asked for together.
create index if not exists creative_assignments_account_idx
  on public.creative_assignments (launch_date, firm, account);

comment on column public.creative_assignments.account is
  'Meta ad account key the brief launches into — ''asd'' (Accident Support '
  'Desk) or ''jm'' (Collision Support Desk). Only meaningful for a firm that '
  'runs in more than one account. Null means not recorded; the boards then '
  'treat the firm as a single lane.';

comment on column public.creative_tasks.account is
  'As creative_assignments.account — carried so a production task inherits '
  'the account of the brief it came from.';
