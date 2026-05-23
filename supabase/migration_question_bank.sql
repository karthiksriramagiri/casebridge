-- How many questions to show per attempt (0 = show all)
alter table public.modules
  add column if not exists quiz_question_count integer not null default 0;
