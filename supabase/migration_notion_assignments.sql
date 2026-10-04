-- Notion mirror for the creative assignments board.
--
-- Each brief remembers the Notion page it was mirrored to, so an edit updates
-- that page instead of creating a second one. Without this column the mirror
-- refuses to run at all — a mirror that cannot remember what it already wrote
-- produces a duplicate per drag, which is worse than no mirror.

alter table public.creative_briefs
  add column if not exists notion_page_id text;

comment on column public.creative_briefs.notion_page_id is
  'Notion page this brief is mirrored to. Null = not mirrored yet.';

-- One brief per Notion page, so a retry after a half-failed write cannot end
-- up with two briefs pointing at the same page.
create unique index if not exists creative_briefs_notion_page_id_key
  on public.creative_briefs (notion_page_id)
  where notion_page_id is not null;
