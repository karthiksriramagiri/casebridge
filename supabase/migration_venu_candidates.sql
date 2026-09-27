-- ============================================================
-- Venu — interview onboarding
--
-- A candidate opens a shared link, makes a temporary account (name, email
-- and the WhatsApp number we will add them to a group on), answers the
-- qualification questions and uploads the recording of their first
-- interview. Slack gets a ping, we mark them qualified or not, and a
-- qualified candidate gets Team Center credentials from the same screen.
--
-- The token in the URL *is* the account — there is no password and no auth
-- user until they are onboarded, which is what makes it temporary.
--
-- Run in the Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venu_candidates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token               text NOT NULL UNIQUE,
  name                text NOT NULL,
  email               text,
  phone               text,                       -- WhatsApp number, E.164 — collected at the end of the interview
  source              text,                       -- upwork | referral | direct
  role_applied        text,                       -- setter | closer | intake

  answers             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- transcripts, keyed by question
  recording_path      text,                       -- object in the venu-interviews bucket
  recording_name      text,
  recording_size      bigint,
  submitted_at        timestamptz,

  status              text NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited','submitted','qualified','not_qualified','onboarded')),
  reviewed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name    text,
  reviewed_at         timestamptz,
  review_note         text,

  -- Onboarding, once qualified
  whatsapp_group_url  text,
  whatsapp_invited_at timestamptz,
  team_profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_login_email    text,                       -- the password is never stored
  onboarded_at        timestamptz,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Optional tidy-up, not required by the app: the phone arrives at the end of
-- the interview, and until then the row carries an empty string rather than a
-- null so the original NOT NULL constraint is satisfied either way.
ALTER TABLE public.venu_candidates ALTER COLUMN phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venu_candidates_status ON public.venu_candidates(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venu_candidates_token  ON public.venu_candidates(token);

-- The candidate portal is public, so the table must never be readable with the
-- anon key: every read and write goes through a route holding the service role,
-- which is exempt from RLS. Enabling it with no policies denies everyone else.
ALTER TABLE public.venu_candidates ENABLE ROW LEVEL SECURITY;

-- Interview recordings. Private — played back through short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('venu-interviews', 'venu-interviews', false, 2147483648)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2147483648;
