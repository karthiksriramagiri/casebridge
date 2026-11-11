-- One brief, one Slack thread.
--
-- Run after migration_creative_assignments.sql.
--
-- Every message the center sends about a brief used to be a new message in
-- the channel: the brief landing, the cut coming back for notes, each
-- comment. Three rounds of feedback put six unconnected messages in Slack
-- and you had to read the titles to work out which belonged together.
--
-- Threading them needs somewhere to keep the first message's timestamp,
-- because that timestamp is what every later reply is addressed to. One
-- brief can hold one thread per channel -- a thread cannot span two -- so
-- this is a map of channel to timestamp rather than a single value.
--
--   { "revise": "1794339000.123456", "review": "1794341234.654321" }
--
-- Without this column the center still posts, unthreaded, exactly as before.

alter table public.creative_assignments
  add column if not exists slack_threads jsonb not null default '{}'::jsonb;

comment on column public.creative_assignments.slack_threads is
  'Slack channel key -> thread timestamp (ts) of the first message about this brief in that channel. Later notifications reply under it. Empty means no thread has been started yet.';
