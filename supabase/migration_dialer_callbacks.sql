-- Standalone callbacks table — not part of the dialer queue.
-- Callbacks come from GHL task webhooks or dialer dispositions.
-- Reps manually call from the Callbacks page.
create table if not exists public.dialer_callbacks (
  id                uuid primary key default gen_random_uuid(),
  contact_id        text,
  contact_name      text not null,
  phone             text not null,
  firm              text,
  stage_name        text,
  callback_at       timestamptz not null,
  callback_context  text,
  source            text not null default 'manual',   -- 'ghl', 'disposition', 'manual'
  owner_rep         text,
  status            text not null default 'pending',  -- 'pending', 'completed', 'cancelled'
  completed_at      timestamptz,
  completed_by      text,
  disposition       text,
  ghl_task_id       text,
  created_at        timestamptz default now()
);

create index if not exists dialer_callbacks_status   on public.dialer_callbacks(status);
create index if not exists dialer_callbacks_callback on public.dialer_callbacks(callback_at);

alter table public.dialer_callbacks enable row level security;
