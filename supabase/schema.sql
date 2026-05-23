-- ============================================================
-- CaseBridge Teams Training Platform – Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Profiles (one per auth.users row)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null default '',
  role text not null default 'rep' check (role in ('admin', 'rep')),
  created_at timestamptz default now()
);

-- Training modules
create table public.modules (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  pass_threshold integer default 80,
  is_required boolean default true,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Questions for each module
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  module_id uuid references public.modules(id) on delete cascade not null,
  question_text text not null,
  position integer default 0,
  created_at timestamptz default now()
);

-- Answer options (multiple choice)
create table public.options (
  id uuid default gen_random_uuid() primary key,
  question_id uuid references public.questions(id) on delete cascade not null,
  option_text text not null,
  is_correct boolean default false,
  position integer default 0
);

-- Quiz attempt records
create table public.attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  module_id uuid references public.modules(id) on delete cascade not null,
  score integer not null,
  passed boolean not null,
  attempt_number integer not null default 1,
  is_invalidated boolean default false,
  created_at timestamptz default now()
);

-- Individual answers within an attempt
create table public.attempt_answers (
  id uuid default gen_random_uuid() primary key,
  attempt_id uuid references public.attempts(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  selected_option_id uuid references public.options(id) on delete cascade not null
);

-- Team announcements (only one active at a time)
create table public.announcements (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  is_active boolean default true
);

-- Training programs (groups of modules)
create table public.programs (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text default '',
  created_at timestamptz default now()
);

-- Modules assigned to programs
create table public.program_modules (
  program_id uuid references public.programs(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  position integer default 0,
  primary key (program_id, module_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.modules enable row level security;
alter table public.questions enable row level security;
alter table public.options enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.announcements enable row level security;
alter table public.programs enable row level security;
alter table public.program_modules enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Admins can read all profiles" on public.profiles
  for select using (public.is_admin());
create policy "Admins can insert profiles" on public.profiles
  for insert with check (public.is_admin());
create policy "Admins can update profiles" on public.profiles
  for update using (public.is_admin());
create policy "Admins can delete profiles" on public.profiles
  for delete using (public.is_admin());
create policy "Service role can manage profiles" on public.profiles
  for all using (true);

-- Modules (everyone authenticated can read active ones)
create policy "Authenticated users can read active modules" on public.modules
  for select using (auth.role() = 'authenticated' and is_active = true);
create policy "Admins can read all modules" on public.modules
  for select using (public.is_admin());
create policy "Admins can manage modules" on public.modules
  for all using (public.is_admin());

-- Questions
create policy "Authenticated can read questions" on public.questions
  for select using (auth.role() = 'authenticated');
create policy "Admins can manage questions" on public.questions
  for all using (public.is_admin());

-- Options
create policy "Authenticated can read options" on public.options
  for select using (auth.role() = 'authenticated');
create policy "Admins can manage options" on public.options
  for all using (public.is_admin());

-- Attempts
create policy "Users can read own attempts" on public.attempts
  for select using (auth.uid() = user_id);
create policy "Users can insert own attempts" on public.attempts
  for insert with check (auth.uid() = user_id);
create policy "Admins can read all attempts" on public.attempts
  for select using (public.is_admin());
create policy "Admins can update attempts" on public.attempts
  for update using (public.is_admin());

-- Attempt answers
create policy "Users can manage own attempt_answers" on public.attempt_answers
  for all using (
    exists (
      select 1 from public.attempts
      where attempts.id = attempt_answers.attempt_id
        and attempts.user_id = auth.uid()
    )
  );
create policy "Admins can read all attempt_answers" on public.attempt_answers
  for select using (public.is_admin());

-- Announcements
create policy "Authenticated can read active announcements" on public.announcements
  for select using (auth.role() = 'authenticated' and is_active = true);
create policy "Admins can manage announcements" on public.announcements
  for all using (public.is_admin());

-- Programs
create policy "Authenticated can read programs" on public.programs
  for select using (auth.role() = 'authenticated');
create policy "Admins can manage programs" on public.programs
  for all using (public.is_admin());

-- Program modules
create policy "Authenticated can read program_modules" on public.program_modules
  for select using (auth.role() = 'authenticated');
create policy "Admins can manage program_modules" on public.program_modules
  for all using (public.is_admin());

-- ============================================================
-- Trigger: auto-create profile on new user signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'rep')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
