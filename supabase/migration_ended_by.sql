-- Add ended_by column to track who hung up the call
-- Values: 'rep' (rep clicked hangup) or 'contact' (prospect hung up)
alter table public.dialer_calls add column if not exists ended_by text;
