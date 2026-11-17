-- ─────────────────────────────────────────────────────────────────────────────
-- Who got them back on the phone.
--
-- The board already records who CLOSED a case. It did not record who
-- reconnected it, and those are often different people: the closer is busy,
-- somebody else works the board and gets through. That rep earns a quarter
-- of the case's commission, and until now there was nowhere to write down
-- that they had earned it.
--
-- Two forms, matching how `closer` is already stored: the id links to a
-- profile so pay can find the rep, the name survives when the profile does
-- not. Both are set together.
--
-- Safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.mia_cases
  add column if not exists reconnected_by_id uuid references public.profiles(id) on delete set null,
  add column if not exists reconnected_by    text,
  add column if not exists reconnected_at    timestamptz;

comment on column public.mia_cases.reconnected_by_id is
  'The rep who got this case back. Earns 25% of the case commission when it is not the closer.';
comment on column public.mia_cases.reconnected_at is
  'When the reconnection was recorded. A bonus is only owed once this is set.';

-- Pay reads this per rep, every time a pay page is opened.
create index if not exists mia_cases_reconnected_by_idx
  on public.mia_cases (reconnected_by_id)
  where reconnected_by_id is not null;
