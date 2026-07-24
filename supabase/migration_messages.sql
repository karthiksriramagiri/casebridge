-- ============================================================
-- Dialer: SMS messages
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists public.dialer_messages (
  id            uuid primary key default gen_random_uuid(),
  message_sid   text unique,                        -- Twilio MessageSid
  direction     text not null,                      -- 'inbound' | 'outbound'
  from_number   text not null,
  to_number     text not null,
  body          text,
  status        text,                               -- sent / delivered / failed / received
  media_url     text,                               -- MMS attachment URL if any
  contact_id    text,                               -- GHL contact ID (looked up by phone)
  contact_name  text,
  rep_identity  text,                               -- who sent it (outbound)
  firm          text,
  read          boolean default false,
  created_at    timestamptz default now()
);

create index if not exists dialer_messages_from_number on public.dialer_messages(from_number);
create index if not exists dialer_messages_to_number   on public.dialer_messages(to_number);
create index if not exists dialer_messages_contact_id  on public.dialer_messages(contact_id);
create index if not exists dialer_messages_created_at  on public.dialer_messages(created_at desc);

alter table public.dialer_messages enable row level security;
