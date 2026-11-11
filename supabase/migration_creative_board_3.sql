-- Taking a row off the Relaunch / Fatigue page without erasing the kill.
--
-- Run after migration_creative_board.sql.
--
-- The archive is built out of the kill rows, so "delete this from the
-- fatigue page" used to mean deleting the kill itself. That tidied the page
-- and quietly took the record with it: the ad vanished from the day it was
-- killed on, and out of "everything ever killed" — a history someone will
-- want long after they have stopped caring about the archive row.
--
-- So the row is hidden rather than deleted. The kill stays exactly where it
-- was; the archive simply stops listing it.

alter table public.creative_kill
  add column if not exists archive_hidden_at timestamptz;

comment on column public.creative_kill.archive_hidden_at is
  'Set when someone removes the ad from the Relaunch / Fatigue list. The kill '
  'itself is untouched — it still counts on its own day and still appears in '
  'the killed history. Null means the ad is still listed in the archive.';
