-- Add summary column to dialer_transcripts
-- Run this if you already ran migration_dialer.sql previously
alter table public.dialer_transcripts
  add column if not exists summary text;
