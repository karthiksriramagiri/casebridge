-- Curriculum seed: Programs (sections) and Modules (lessons)
-- Run this in the Supabase SQL editor.

DO $$
DECLARE
  prog_intro  uuid := gen_random_uuid();
  prog_ops    uuid := gen_random_uuid();
  prog_qual   uuid := gen_random_uuid();
  prog_main   uuid := gen_random_uuid();

  mod_bm      uuid := gen_random_uuid();
  mod_team    uuid := gen_random_uuid();
  mod_slack   uuid := gen_random_uuid();
  mod_ghl     uuid := gen_random_uuid();
  mod_criteria uuid := gen_random_uuid();
  mod_states  uuid := gen_random_uuid();
  mod_closing uuid := gen_random_uuid();
  mod_newlead uuid := gen_random_uuid();
  mod_calltxt uuid := gen_random_uuid();
  mod_notes   uuid := gen_random_uuid();
  mod_docu    uuid := gen_random_uuid();
  mod_listen  uuid := gen_random_uuid();
BEGIN

  -- ── Programs (sections) ──────────────────────────────────────────────
  INSERT INTO public.programs (id, name, description) VALUES
    (prog_intro, 'Introduction',            'Overview of the business and industry'),
    (prog_ops,   'Ops Overview',            'Platform and tool walkthroughs'),
    (prog_qual,  'Qualification Training',  'Lead qualification criteria and state laws'),
    (prog_main,  'Main Training Module',    'Core workflow and closing process');

  -- ── Modules (lessons) ────────────────────────────────────────────────

  -- Introduction
  INSERT INTO public.modules (id, title, description, pass_threshold, is_required, content_type, video_url) VALUES
    (mod_bm, 'BM Overview', 'Understand the business and industry.', 80, true, 'video',
     'https://www.loom.com/share/54b8b6f4ad414c8f99525aebc65ecaef');

  -- Ops Overview
  INSERT INTO public.modules (id, title, description, pass_threshold, is_required, content_type, video_url) VALUES
    (mod_team,  'Team Page Overview', 'Modules, Exams, Content, Announcements', 80, true, 'video',
     'https://www.loom.com/share/d9ca5a1839c14f528d2365adc7c4b3c9'),
    (mod_slack, 'Slack Overview',     '',                                       80, true, 'video',
     'https://www.loom.com/share/c351324197a144dc88d63c8e140a7c71'),
    (mod_ghl,   'GHL Overview',       '',                                       80, true, 'video',
     'https://www.loom.com/share/dea8b9c698f54217b40fc9031af4b175');

  -- Qualification Training
  INSERT INTO public.modules (id, title, description, pass_threshold, is_required, content_type, video_url) VALUES
    (mod_criteria, 'Criteria Overview — Jacoby and Meyers',
     'Criteria Testing/Exam — Certified or not. Questions sourced from the Jacoby and Meyers criteria bank.',
     80, true, 'none', ''),
    (mod_states, 'State Laws Overview',
     'Key state-specific laws for CA, TX, CO, and GA.',
     80, true, 'none', '');

  -- Main Training Module
  INSERT INTO public.modules (id, title, description, pass_threshold, is_required, content_type, video_url) VALUES
    (mod_closing, 'Closing Overview & Workflow',
     'Call requirements and closing workflow.',
     80, true, 'none', ''),
    (mod_newlead, 'Receiving a New Lead in Slack → GHL', '', 80, true, 'video',
     'https://www.loom.com/share/dc2e3acdf6334472ae2fd522bda251ed'),
    (mod_calltxt, 'How to Call and Text on GHL',
     'Calling and texting SOP.',
     80, true, 'none', ''),
    (mod_notes,  'How to Log Notes & Tasks', '', 80, true, 'video',
     'https://www.loom.com/share/c2247af5462e4531ade3d4c38315e637'),
    (mod_docu,   'Sending Docuseal Agreement', '', 80, true, 'video',
     'https://www.loom.com/share/de087e4f2be74dc681fa42302a2867a1'),
    (mod_listen, 'Listening to the Call', '', 80, true, 'video',
     'https://www.loom.com/share/dea142d79f084e66b6ea618c2a388778');

  -- ── Program ↔ Module links (position = display order) ────────────────
  INSERT INTO public.program_modules (program_id, module_id, position) VALUES
    -- Introduction
    (prog_intro, mod_bm,       0),
    -- Ops Overview
    (prog_ops,   mod_team,     0),
    (prog_ops,   mod_slack,    1),
    (prog_ops,   mod_ghl,      2),
    -- Qualification Training
    (prog_qual,  mod_criteria, 0),
    (prog_qual,  mod_states,   1),
    -- Main Training Module
    (prog_main,  mod_closing,  0),
    (prog_main,  mod_newlead,  1),
    (prog_main,  mod_calltxt,  2),
    (prog_main,  mod_notes,    3),
    (prog_main,  mod_docu,     4),
    (prog_main,  mod_listen,   5);

END $$;
