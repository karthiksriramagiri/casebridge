-- ─────────────────────────────────────────────────────────────────────────────
-- Forwarding an inbound call to a real phone.
--
-- An inbound call waits in a conference on hold music until a rep with the
-- dialer open in a browser clicks Answer. When nobody does, the caller hears
-- the music for two minutes and is then hung up on: 23 of the last 40 calls
-- ended that way.
--
-- So the call now also rings a real phone — the Quo number — at the same
-- time. Whoever picks up first joins the same conference and the music stops.
-- These two columns are what lets the two legs know about each other:
--
--   forward_call_sid   the outbound leg ringing the phone, so it can be
--                      cancelled the moment a rep claims the call in the
--                      browser. Without it the phone would go on ringing
--                      after the call was already answered.
--   answered_via       which way it was picked up. The miss rate is the
--                      reason this exists at all, so being able to ask
--                      "how many did the phone catch" is the point.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.dialer_inbound_queue
  add column if not exists forward_call_sid text,
  -- 'browser' | 'forward' | null while still ringing
  add column if not exists answered_via     text;

comment on column public.dialer_inbound_queue.forward_call_sid is
  'The outbound leg ringing the forward phone, so it can be cancelled when a browser rep answers first.';
comment on column public.dialer_inbound_queue.answered_via is
  'How the call was answered: browser (a rep in the dialer) or forward (the Quo phone).';
