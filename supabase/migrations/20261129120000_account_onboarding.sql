-- Customer onboarding: the details the admin needs to connect a customer's
-- accounts by hand (name, company, Instagram username, Facebook id, optional
-- Telegram bot token), and where each customer is in that process.
--
-- * telegram_bot_token is stored sealed (enc:v1:) by the API, never plaintext.
-- * Accessed only through the service role (RLS on, no policies).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.account_onboarding;

CREATE TABLE IF NOT EXISTS public.account_onboarding (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  company text,
  instagram_username text,
  facebook_id text,
  telegram_bot_token text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'link_sent', 'connected')),
  admin_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  admin_seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS account_onboarding_status_idx ON public.account_onboarding (status, submitted_at DESC);
ALTER TABLE public.account_onboarding ENABLE ROW LEVEL SECURITY;
