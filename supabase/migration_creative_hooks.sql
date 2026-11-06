-- Hooks created from the Creative Center.
--
-- Every ad name carries two codes — a visual hook and a verbal one:
--
--   0826 | B00090_BNR1 | LHP | BNR | G1 | H4 | GA-WIN
--                               ^^   ^^
--                            visual  verbal
--
-- Their names have lived in app/_metrics/hooks.ts, which means naming a new
-- hook needed a code change and a deploy. The reports already fall back to
-- the raw code when a name is missing, so an unnamed hook was never lost —
-- it just read as "A18" instead of saying what A18 is.
--
-- This table holds the ones added from the UI. It is merged *over* the static
-- table at read time, so the file stays the baseline and nothing here can
-- break an existing name by being absent.

create table if not exists public.creative_hooks (
  code        text primary key,
  name        text not null,
  kind        text not null check (kind in ('visual', 'verbal')),
  created_at  timestamptz not null default now(),
  created_by  text
);

comment on table public.creative_hooks is
  'Hook codes named from the Creative Center. Merged over app/_metrics/hooks.ts at read time.';

-- A code is one letter and a number: A3, B12, G1. The letter decides which
-- half of the pair it is, so it is checked rather than trusted from the form.
alter table public.creative_hooks
  drop constraint if exists creative_hooks_code_shape;
alter table public.creative_hooks
  add constraint creative_hooks_code_shape check (code ~ '^[A-L][0-9]{1,3}$');

-- Visual hooks are the odd letters, verbal the even: A/B, C/D, E/F, G/H,
-- I/J, K/L. Storing `kind` alongside the code would let the two disagree, so
-- it is pinned to the letter.
alter table public.creative_hooks
  drop constraint if exists creative_hooks_kind_matches_code;
alter table public.creative_hooks
  add constraint creative_hooks_kind_matches_code check (
    (kind = 'visual' and left(code, 1) in ('A', 'C', 'E', 'G', 'I', 'K')) or
    (kind = 'verbal' and left(code, 1) in ('B', 'D', 'F', 'H', 'J', 'L'))
  );

create index if not exists creative_hooks_kind_idx on public.creative_hooks (kind);

alter table public.creative_hooks enable row level security;

-- Read and written through the service role from the Creative Center's own
-- routes, which authenticate with the casebridge_session cookie. No anon
-- policy is wanted: without one, RLS denies everything that is not the
-- service key, which is the intent.
