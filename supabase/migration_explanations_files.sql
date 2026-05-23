-- Add explanation field to questions
alter table public.questions
  add column if not exists explanation text default '';

-- Drop old content_type constraint and re-add with 'file' included
alter table public.modules
  drop constraint if exists modules_content_type_check;

alter table public.modules
  add constraint modules_content_type_check
  check (content_type in ('none', 'video', 'text', 'file'));

-- Add file storage fields to modules
alter table public.modules
  add column if not exists file_url text default '',
  add column if not exists file_name text default '';

-- Storage: run this separately in Supabase Storage UI or via the dashboard
-- Create a bucket named "module-files" with public access enabled
