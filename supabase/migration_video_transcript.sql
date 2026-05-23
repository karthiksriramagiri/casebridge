alter table public.modules
  add column if not exists video_transcript text default '';
