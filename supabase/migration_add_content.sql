-- Add content fields to modules
alter table public.modules
  add column if not exists content_type text not null default 'none'
    check (content_type in ('none', 'video', 'text')),
  add column if not exists video_url text default '',
  add column if not exists content_body text default '';
