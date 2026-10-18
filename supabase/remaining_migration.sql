-- ========================================================
-- HELIXA / CYREAX DM: REMAINING MIGRATIONS (Phases 3 to 7)
-- (Phase 1 & 2 workspaces have already succeeded in your database)
-- ========================================================

-- Global Extensions and Column Prerequisites
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE IF EXISTS public.conversations ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'instagram';
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON public.conversations(platform);

ALTER TABLE IF EXISTS public.messages ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'instagram';
CREATE INDEX IF NOT EXISTS idx_messages_platform ON public.messages(platform);

-- Ensure platform_content and comment_sentiment have required columns
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS comment_id TEXT;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS confidence NUMERIC(4, 2) DEFAULT 1.0;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS raw_analysis JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;


-- --------------------------------------------------------
-- START OF FILE: 20260910_57_platform_content_sentiment.sql
-- --------------------------------------------------------

-- ============================================================================
-- Migration 57: Platform Content & Comment Sentiment Analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'telegram', 'messenger', 'whatsapp')),
  external_post_id TEXT NOT NULL,
  permalink TEXT,
  caption TEXT,
  thumbnail_url TEXT,
  author_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, platform, external_post_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_content_account ON public.platform_content(account_id);
CREATE INDEX IF NOT EXISTS idx_platform_content_post ON public.platform_content(external_post_id);
CREATE INDEX IF NOT EXISTS idx_platform_content_platform_post ON public.platform_content(platform, external_post_id);

CREATE TABLE IF NOT EXISTS public.comment_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  platform_content_id UUID REFERENCES public.platform_content(id) ON DELETE SET NULL,
  external_post_id TEXT NOT NULL,
  comment_id TEXT NOT NULL UNIQUE,
  comment_text TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  confidence NUMERIC(4, 2) DEFAULT 1.0,
  raw_analysis JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comment_sentiment_post ON public.comment_sentiment(external_post_id);
CREATE INDEX IF NOT EXISTS idx_comment_sentiment_account ON public.comment_sentiment(account_id);
CREATE INDEX IF NOT EXISTS idx_comment_sentiment_comment ON public.comment_sentiment(comment_id);

ALTER TABLE public.automation_events ADD COLUMN IF NOT EXISTS post_id TEXT;
CREATE INDEX IF NOT EXISTS idx_automation_events_post_id ON public.automation_events(post_id);

ALTER TABLE public.platform_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_sentiment ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Accounts can view and manage their own platform content' AND tablename = 'platform_content') THEN
    CREATE POLICY "Accounts can view and manage their own platform content"
      ON public.platform_content
      FOR ALL
      USING (account_id = auth.uid())
      WITH CHECK (account_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Accounts can view and manage their comment sentiment' AND tablename = 'comment_sentiment') THEN
    CREATE POLICY "Accounts can view and manage their comment sentiment"
      ON public.comment_sentiment
      FOR ALL
      USING (account_id = auth.uid())
      WITH CHECK (account_id = auth.uid());
  END IF;
END $$;



-- --------------------------------------------------------
-- START OF FILE: 20260930_phase3_contacts_and_clicks.sql
-- --------------------------------------------------------

-- Phase 3: workspace contacts, messaging window, message direction, click tracking.
-- Run after 20260930_phase2_workspaces_and_events.sql. Idempotent. Does not delete rows.
-- Do not run this from the app. Run it in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Outbound vs inbound. The old is_from_instagram flag meant inbound on
-- Instagram and WhatsApp, and was false for both directions on Messenger
-- and Telegram. sender_id matching the conversation recipient is the inbound
-- message.
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS direction text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_direction_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_direction_check
      CHECK (direction IS NULL OR direction IN ('in', 'out'));
  END IF;
END $$;

UPDATE public.messages m
SET direction = CASE
  WHEN c.recipient_id IS NOT NULL AND m.sender_id::text = c.recipient_id::text THEN 'in'
  WHEN COALESCE(m.is_from_instagram, false) THEN 'in'
  ELSE 'out'
END
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.direction IS NULL;

UPDATE public.messages
SET direction = CASE WHEN COALESCE(is_from_instagram, false) THEN 'in' ELSE 'out' END
WHERE direction IS NULL;

CREATE INDEX IF NOT EXISTS messages_user_direction_idx
  ON public.messages (user_id, direction);

-- ---------------------------------------------------------------------------
-- One contact per person per channel, scoped to the workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id bigint NOT NULL,
  channel text NOT NULL,
  external_id text NOT NULL,
  display_name text,
  username text,
  tags text[] NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  source_automation_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_at timestamptz,
  bot_paused boolean NOT NULL DEFAULT false,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_channel_external_idx
  ON public.contacts (user_id, channel, external_id);

CREATE INDEX IF NOT EXISTS contacts_workspace_idx
  ON public.contacts (workspace_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS contacts_last_inbound_idx
  ON public.contacts (user_id, channel, last_inbound_at);

-- ---------------------------------------------------------------------------
-- Redirect targets for /r/[code]. A hit writes automation_events.link_click.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracked_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  workspace_id uuid,
  user_id bigint,
  automation_id uuid,
  variant_id uuid,
  channel text,
  contact_external_id text,
  destination_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracked_links_user_idx ON public.tracked_links (user_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS helixa_contacts_select ON public.contacts;
CREATE POLICY helixa_contacts_select ON public.contacts
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
    OR public.helixa_owns_profile(user_id)
    OR public.helixa_is_admin()
  );

DROP POLICY IF EXISTS helixa_tracked_links_select ON public.tracked_links;
CREATE POLICY helixa_tracked_links_select ON public.tracked_links
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
    OR public.helixa_owns_profile(user_id)
    OR public.helixa_is_admin()
  );

-- The redirect and the webhooks use the service role, which bypasses RLS.
-- authenticated has no insert/update policy, so the browser cannot write these.



-- --------------------------------------------------------
-- START OF FILE: 20260930_phase4_channels.sql
-- --------------------------------------------------------

-- Phase 4: WhatsApp numbers, TikTok tokens, website chat.
-- Run after 20260930_phase3_contacts_and_clicks.sql. Idempotent. Does not delete rows.
-- Do not run this from the app. Run it in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- A conversation remembers which number, TikTok account, or widget it uses.
-- The old unique (user_id, recipient_id) would collapse two WhatsApp numbers
-- into one thread. The replacement includes platform and channel account.
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_account_id text;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS external_thread_id text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'conversations'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%user_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%recipient_id%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%channel_account_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.conversations DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_recipient_channel_idx
    ON public.conversations (
      user_id,
      recipient_id,
      COALESCE(platform, ''),
      COALESCE(channel_account_id, '')
    );
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'conversations_user_recipient_channel_idx was not created because duplicate threads exist. Deduplicate, then re-run this statement.';
END $$;

-- ---------------------------------------------------------------------------
-- TikTok refresh tokens. SELECT is revoked the same way as access_token.
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS refresh_token text;

ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_connections' AND column_name = 'refresh_token'
  ) THEN
    EXECUTE 'REVOKE SELECT (refresh_token) ON public.platform_connections FROM anon, authenticated';
  END IF;
END $$;

-- Widen platform checks so tiktok and webchat can be stored and queued.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'platform_connections'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%platform%'
      AND pg_get_constraintdef(con.oid) ILIKE '%whatsapp%'
  LOOP
    EXECUTE format('ALTER TABLE public.platform_connections DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_connections_platform_check') THEN
    ALTER TABLE public.platform_connections
      ADD CONSTRAINT platform_connections_platform_check
      CHECK (platform IN ('instagram', 'facebook', 'messenger', 'whatsapp', 'telegram', 'tiktok', 'webchat'));
  END IF;
END $$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'inbound_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%platform%'
      AND pg_get_constraintdef(con.oid) ILIKE '%instagram%'
  LOOP
    EXECUTE format('ALTER TABLE public.inbound_events DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbound_events_platform_check') THEN
    ALTER TABLE public.inbound_events
      ADD CONSTRAINT inbound_events_platform_check
      CHECK (platform IN ('instagram', 'facebook', 'messenger', 'whatsapp', 'telegram', 'tiktok', 'webchat'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Approved WhatsApp templates, copied from the WABA. The browser can read
-- them. Only the service role writes them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL,
  workspace_id uuid,
  phone_number_id text NOT NULL,
  waba_id text,
  name text NOT NULL,
  language text NOT NULL,
  status text NOT NULL,
  category text,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_number_id, name, language)
);

CREATE INDEX IF NOT EXISTS whatsapp_templates_user_idx
  ON public.whatsapp_templates (user_id, status);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helixa_whatsapp_templates_select ON public.whatsapp_templates;
CREATE POLICY helixa_whatsapp_templates_select ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
    OR public.helixa_owns_profile(user_id)
    OR public.helixa_is_admin()
  );

-- ---------------------------------------------------------------------------
-- Website chat. Visitors have no Supabase session. secret_hash is not
-- readable by authenticated or anon. The widget polls a server route.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webchat_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL,
  workspace_id uuid,
  public_key text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Chat',
  greeting text,
  color text NOT NULL DEFAULT '#111111',
  locale text NOT NULL DEFAULT 'en',
  allowed_domains text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webchat_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id uuid NOT NULL REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  secret_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (widget_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS public.webchat_rate_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webchat_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_rate_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS helixa_webchat_widgets_select ON public.webchat_widgets;
CREATE POLICY helixa_webchat_widgets_select ON public.webchat_widgets
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
    OR public.helixa_owns_profile(user_id)
    OR public.helixa_is_admin()
  );

-- No policy on webchat_visitors or webchat_rate_buckets: default deny.
-- The service role bypasses RLS. Revoke the hash anyway.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'webchat_visitors' AND column_name = 'secret_hash'
  ) THEN
    EXECUTE 'REVOKE SELECT (secret_hash) ON public.webchat_visitors FROM anon, authenticated';
  END IF;
END $$;



-- --------------------------------------------------------
-- START OF FILE: 20260930_phase5_flows_broadcasts.sql
-- --------------------------------------------------------

-- Phase 5: versioned flows, durable runs, broadcasts, sequences, growth tools.
-- Run after 20260930_phase4_channels.sql. Idempotent. Does not delete rows.
-- Do not run this from the app. Run it in the Supabase SQL editor.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS opted_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_follower boolean;

ALTER TABLE public.tracked_links ADD COLUMN IF NOT EXISTS broadcast_id uuid;

-- ---------------------------------------------------------------------------
-- Flows. One graph per version. Live sends read published_version_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  channel text,
  trigger jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_version_id uuid,
  published_version_id uuid,
  source_automation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flows_status_check') THEN
    ALTER TABLE public.flows
      ADD CONSTRAINT flows_status_check CHECK (status IN ('draft', 'live', 'paused'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS flows_source_automation_idx
  ON public.flows (source_automation_id)
  WHERE source_automation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS flows_user_idx ON public.flows (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  version integer NOT NULL,
  graph jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);

CREATE TABLE IF NOT EXISTS public.flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  version_id uuid,
  workspace_id uuid,
  user_id bigint NOT NULL,
  contact_id uuid,
  contact_external_id text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_node_id text,
  wait_kind text,
  resume_at timestamptz,
  step_token text NOT NULL,
  expected_payloads jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  steps integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_runs_status_check') THEN
    ALTER TABLE public.flow_runs
      ADD CONSTRAINT flow_runs_status_check
      CHECK (status IN ('active', 'waiting', 'completed', 'failed', 'paused', 'opted_out'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS flow_runs_contact_idx
  ON public.flow_runs (user_id, contact_external_id, status);

CREATE TABLE IF NOT EXISTS public.flow_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint,
  kind text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  run_id uuid,
  flow_id uuid,
  node_id text,
  step_token text,
  contact_external_id text,
  channel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_jobs_status_check') THEN
    ALTER TABLE public.flow_jobs
      ADD CONSTRAINT flow_jobs_status_check
      CHECK (status IN ('pending', 'processing', 'done', 'dead', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS flow_jobs_due_idx
  ON public.flow_jobs (next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS public.flow_node_stats (
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  runs integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, node_id)
);

-- ---------------------------------------------------------------------------
-- Broadcasts and drip sequences. Each recipient is one queue row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  name text NOT NULL,
  channel text NOT NULL,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_name text,
  template_language text,
  message_tag text,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  per_minute integer NOT NULL DEFAULT 30,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcasts_status_check') THEN
    ALTER TABLE public.broadcasts
      ADD CONSTRAINT broadcasts_status_check
      CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS broadcasts_user_idx ON public.broadcasts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  contact_id uuid,
  contact_external_id text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  skip_reason text,
  idempotency_key text NOT NULL UNIQUE,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcast_recipients_contact_idx
  ON public.broadcast_recipients (contact_external_id, status);

CREATE TABLE IF NOT EXISTS public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  name text NOT NULL,
  channel text NOT NULL,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sequences_status_check') THEN
    ALTER TABLE public.sequences
      ADD CONSTRAINT sequences_status_check CHECK (status IN ('draft', 'live', 'paused'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  contact_id uuid,
  contact_external_id text NOT NULL,
  channel text NOT NULL,
  step_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  next_send_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_external_id)
);

-- ---------------------------------------------------------------------------
-- Creator growth: link-in-bio, ref links, giveaways.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bio_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  collect_email boolean NOT NULL DEFAULT true,
  collect_phone boolean NOT NULL DEFAULT true,
  flow_id uuid,
  locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ref_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  channel text NOT NULL,
  handle text NOT NULL,
  code text NOT NULL,
  flow_id uuid,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, code)
);

CREATE TABLE IF NOT EXISTS public.giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  name text NOT NULL,
  keyword text NOT NULL,
  channel text NOT NULL DEFAULT 'instagram',
  media_id text,
  status text NOT NULL DEFAULT 'open',
  winners jsonb NOT NULL DEFAULT '[]'::jsonb,
  winner_count integer NOT NULL DEFAULT 1,
  drawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'giveaways_status_check') THEN
    ALTER TABLE public.giveaways
      ADD CONSTRAINT giveaways_status_check CHECK (status IN ('open', 'drawn', 'closed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  contact_external_id text NOT NULL,
  contact_id uuid,
  entered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, contact_external_id)
);

-- ---------------------------------------------------------------------------
-- Queue claim. Service role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_flow_jobs(batch_size integer, lock_seconds integer)
RETURNS SETOF public.flow_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.flow_jobs j
    WHERE (
      j.status = 'pending' AND j.next_attempt_at <= now()
    ) OR (
      j.status = 'processing'
      AND j.locked_at IS NOT NULL
      AND j.locked_at < now() - make_interval(secs => GREATEST(lock_seconds, 30))
    )
    ORDER BY j.next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(batch_size, 1)
  )
  UPDATE public.flow_jobs job
  SET status = 'processing',
      locked_at = now()
  FROM due
  WHERE job.id = due.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_flow_node_stat(
  p_flow_id uuid,
  p_node_id text,
  p_runs integer,
  p_clicks integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.flow_node_stats (flow_id, node_id, runs, clicks)
  VALUES (p_flow_id, p_node_id, GREATEST(COALESCE(p_runs, 0), 0), GREATEST(COALESCE(p_clicks, 0), 0))
  ON CONFLICT (flow_id, node_id) DO UPDATE
  SET runs = public.flow_node_stats.runs + GREATEST(COALESCE(p_runs, 0), 0),
      clicks = public.flow_node_stats.clicks + GREATEST(COALESCE(p_clicks, 0), 0),
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_flow_jobs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_flow_node_stat(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_flow_jobs(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_flow_node_stat(uuid, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS. The server uses the service role and bypasses these policies.
-- ---------------------------------------------------------------------------
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_node_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bio_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.flow_jobs FROM anon, authenticated;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'flows', 'flow_runs', 'broadcasts', 'sequences', 'bio_pages', 'ref_links', 'giveaways'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS helixa_%s_select ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY helixa_%s_select ON public.%I FOR SELECT TO authenticated USING (
        (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
        OR public.helixa_owns_profile(user_id)
        OR public.helixa_is_admin()
      )',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Child tables that have no workspace_id / user_id of their own.
DROP POLICY IF EXISTS helixa_flow_versions_select ON public.flow_versions;
CREATE POLICY helixa_flow_versions_select ON public.flow_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.flows f
      WHERE f.id = flow_id
        AND (
          (f.workspace_id IS NOT NULL AND public.helixa_can_read_workspace(f.workspace_id))
          OR public.helixa_owns_profile(f.user_id)
          OR public.helixa_is_admin()
        )
    )
  );

DROP POLICY IF EXISTS helixa_flow_node_stats_select ON public.flow_node_stats;
CREATE POLICY helixa_flow_node_stats_select ON public.flow_node_stats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.flows f
      WHERE f.id = flow_id
        AND (
          (f.workspace_id IS NOT NULL AND public.helixa_can_read_workspace(f.workspace_id))
          OR public.helixa_owns_profile(f.user_id)
          OR public.helixa_is_admin()
        )
    )
  );

DROP POLICY IF EXISTS helixa_broadcast_recipients_select ON public.broadcast_recipients;
CREATE POLICY helixa_broadcast_recipients_select ON public.broadcast_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.broadcasts b
      WHERE b.id = broadcast_id
        AND (
          (b.workspace_id IS NOT NULL AND public.helixa_can_read_workspace(b.workspace_id))
          OR public.helixa_owns_profile(b.user_id)
          OR public.helixa_is_admin()
        )
    )
  );

DROP POLICY IF EXISTS helixa_sequence_enrollments_select ON public.sequence_enrollments;
CREATE POLICY helixa_sequence_enrollments_select ON public.sequence_enrollments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sequences s
      WHERE s.id = sequence_id
        AND (
          (s.workspace_id IS NOT NULL AND public.helixa_can_read_workspace(s.workspace_id))
          OR public.helixa_owns_profile(s.user_id)
          OR public.helixa_is_admin()
        )
    )
  );

DROP POLICY IF EXISTS helixa_giveaway_entries_select ON public.giveaway_entries;
CREATE POLICY helixa_giveaway_entries_select ON public.giveaway_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.giveaways g
      WHERE g.id = giveaway_id
        AND (
          (g.workspace_id IS NOT NULL AND public.helixa_can_read_workspace(g.workspace_id))
          OR public.helixa_owns_profile(g.user_id)
          OR public.helixa_is_admin()
        )
    )
  );



-- --------------------------------------------------------
-- START OF FILE: 20260930_phase6_differentiators.sql
-- --------------------------------------------------------

-- Phase 6: Arabic agent, agency white-label, catalog, and integrations.
-- Run after 20260930_phase5_flows_broadcasts.sql. Idempotent. Does not delete rows.
-- Do not run this from the app. Enable the pgvector extension in the Supabase
-- dashboard before running this file if CREATE EXTENSION is restricted.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Arabic-first agent. One settings row per workspace profile (users.id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_agent_settings (
  user_id bigint PRIMARY KEY,
  workspace_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  persona_name text NOT NULL DEFAULT 'Helixa',
  persona text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'friendly',
  handoff_below numeric NOT NULL DEFAULT 0.45,
  stay_on_topic boolean NOT NULL DEFAULT true,
  min_similarity numeric NOT NULL DEFAULT 0.12,
  qualify_fields jsonb NOT NULL DEFAULT '["name","phone","email"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_agent_settings_tone_check') THEN
    ALTER TABLE public.ai_agent_settings
      ADD CONSTRAINT ai_agent_settings_tone_check CHECK (tone IN ('friendly', 'professional', 'concise'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  kind text NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_sources_kind_check') THEN
    ALTER TABLE public.knowledge_sources
      ADD CONSTRAINT knowledge_sources_kind_check
      CHECK (kind IN ('faq', 'product', 'policy', 'website', 'document'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_sources_user_idx ON public.knowledge_sources (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  workspace_id uuid,
  user_id bigint NOT NULL,
  content text NOT NULL,
  embedding vector(384),
  embedder text NOT NULL DEFAULT 'hash-v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_user_idx ON public.knowledge_chunks (user_id, embedder);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS public.ai_answer_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  contact_external_id text,
  channel text,
  question text NOT NULL,
  answer text NOT NULL,
  dialect text,
  gulf text,
  arabizi boolean NOT NULL DEFAULT false,
  confidence numeric,
  handoff boolean NOT NULL DEFAULT false,
  handoff_reason text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_answer_logs_user_idx ON public.ai_answer_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  p_user_id bigint,
  p_embedding vector(384),
  p_embedder text,
  p_limit int
)
RETURNS TABLE (id uuid, source_id uuid, content text, similarity float)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.source_id, c.content, (1 - (c.embedding <=> p_embedding))::float AS similarity
  FROM public.knowledge_chunks c
  WHERE c.user_id = p_user_id
    AND c.embedder = p_embedder
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 4), 20));
$$;

-- ---------------------------------------------------------------------------
-- Agency white-label. A custom domain resolves to one agency.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL,
  name text NOT NULL,
  app_name text NOT NULL DEFAULT 'Helixa',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#5b4dff',
  accent_color text NOT NULL DEFAULT '#e5a93c',
  custom_domain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencies_domain_idx
  ON public.agencies (lower(custom_domain))
  WHERE custom_domain IS NOT NULL AND custom_domain <> '';

CREATE INDEX IF NOT EXISTS agencies_owner_idx ON public.agencies (owner_account_id);

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS agency_id uuid;

CREATE TABLE IF NOT EXISTS public.client_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  agency_id uuid,
  cadence text NOT NULL DEFAULT 'weekly',
  format text NOT NULL DEFAULT 'link',
  recipient_email text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  next_send_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_reports_cadence_check') THEN
    ALTER TABLE public.client_reports
      ADD CONSTRAINT client_reports_cadence_check CHECK (cadence IN ('weekly', 'monthly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_reports_format_check') THEN
    ALTER TABLE public.client_reports
      ADD CONSTRAINT client_reports_format_check CHECK (format IN ('pdf', 'link'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.client_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.client_reports(id) ON DELETE CASCADE,
  workspace_id uuid,
  period_label text NOT NULL,
  kpis jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Catalog and orders.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  sku text,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EGP',
  image_url text,
  product_url text,
  in_stock boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_source_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_source_check CHECK (source IN ('manual', 'csv', 'shopify', 'woocommerce'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_external_idx
  ON public.products (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_user_idx ON public.products (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  contact_id uuid,
  contact_external_id text,
  channel text,
  status text NOT NULL DEFAULT 'pending_payment',
  currency text NOT NULL DEFAULT 'EGP',
  total_cents integer NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_provider text,
  payment_link text,
  payment_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN ('draft', 'pending_payment', 'paid', 'fulfilled', 'cancelled', 'refunded'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_user_idx ON public.orders (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Integrations: signed outgoing webhooks, API keys, provider secrets.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outgoing_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  url text NOT NULL,
  secret_ciphertext text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outgoing_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid REFERENCES public.outgoing_webhook_endpoints(id) ON DELETE CASCADE,
  workspace_id uuid,
  user_id bigint NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outgoing_webhook_deliveries_status_check') THEN
    ALTER TABLE public.outgoing_webhook_deliveries
      ADD CONSTRAINT outgoing_webhook_deliveries_status_check
      CHECK (status IN ('pending', 'done', 'dead'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS outgoing_webhook_due_idx
  ON public.outgoing_webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.workspace_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id bigint NOT NULL,
  name text NOT NULL DEFAULT 'Key',
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.integration_configs (
  user_id bigint NOT NULL,
  workspace_id uuid,
  kind text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_configs_kind_check') THEN
    ALTER TABLE public.integration_configs
      ADD CONSTRAINT integration_configs_kind_check
      CHECK (kind IN ('paymob', 'stripe', 'shopify', 'woocommerce', 'sheets', 'hubspot'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS. The app uses the service role. These policies cover a logged-in read.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_answer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outgoing_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outgoing_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.outgoing_webhook_deliveries FROM anon, authenticated;
REVOKE ALL ON public.workspace_api_keys FROM anon, authenticated;
REVOKE ALL ON public.integration_configs FROM anon, authenticated;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ai_agent_settings', 'knowledge_sources', 'knowledge_chunks', 'ai_answer_logs',
    'client_reports', 'products', 'orders', 'outgoing_webhook_endpoints'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS helixa_%s_select ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY helixa_%s_select ON public.%I FOR SELECT TO authenticated USING (
        (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
        OR public.helixa_owns_profile(user_id)
        OR public.helixa_is_admin()
      )',
      tbl, tbl
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS helixa_agencies_select ON public.agencies;
CREATE POLICY helixa_agencies_select ON public.agencies
  FOR SELECT TO authenticated
  USING (owner_account_id = auth.uid() OR public.helixa_is_admin());

DROP POLICY IF EXISTS helixa_client_report_runs_select ON public.client_report_runs;
CREATE POLICY helixa_client_report_runs_select ON public.client_report_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_reports r
      WHERE r.id = report_id
        AND (
          (r.workspace_id IS NOT NULL AND public.helixa_can_read_workspace(r.workspace_id))
          OR public.helixa_owns_profile(r.user_id)
          OR public.helixa_is_admin()
        )
    )
  );



-- --------------------------------------------------------
-- START OF FILE: 20260930_phase7_launch.sql
-- --------------------------------------------------------

-- Phase 7: plans, usage meters, reseller billing, trials, dunning, data deletion.
-- Run after 20260930_phase6_differentiators.sql. Do not run this from the app.
-- Idempotent. It does not delete tenant rows.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bot_locale text NOT NULL DEFAULT 'en';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS bot_locale text NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  account_id uuid PRIMARY KEY,
  plan_id text NOT NULL,
  status text NOT NULL DEFAULT 'trialing',
  interval text NOT NULL DEFAULT 'month',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  scheduled_plan_id text,
  grace_until timestamptz,
  dunning_step integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_accounts_status_check') THEN
    ALTER TABLE public.billing_accounts
      ADD CONSTRAINT billing_accounts_status_check
      CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  metric text NOT NULL,
  period text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, metric, period)
);

CREATE INDEX IF NOT EXISTS usage_meters_account_idx ON public.usage_meters (account_id, period);

CREATE TABLE IF NOT EXISTS public.client_workspace_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  workspace_id uuid NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  interval text NOT NULL DEFAULT 'month',
  provider text NOT NULL DEFAULT 'stripe',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id bigint,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  provider_reference text,
  checkout_url text,
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_invoices_workspace_idx ON public.client_invoices (workspace_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_invoices_status_check') THEN
    ALTER TABLE public.client_invoices
      ADD CONSTRAINT client_invoices_status_check
      CHECK (status IN ('open', 'paid', 'past_due', 'void'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code text NOT NULL UNIQUE,
  provider text NOT NULL,
  external_user_id text,
  status text NOT NULL DEFAULT 'received',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE OR REPLACE FUNCTION public.increment_usage(p_account uuid, p_metric text, p_period text, p_delta int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_used int;
BEGIN
  INSERT INTO public.usage_meters (account_id, metric, period, used)
  VALUES (p_account, p_metric, p_period, GREATEST(COALESCE(p_delta, 1), 0))
  ON CONFLICT (account_id, metric, period)
  DO UPDATE SET used = public.usage_meters.used + EXCLUDED.used, updated_at = now()
  RETURNING used INTO next_used;
  RETURN next_used;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage(uuid, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, text, int) TO service_role;

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_workspace_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.data_deletion_requests FROM anon, authenticated;

DROP POLICY IF EXISTS helixa_billing_accounts_select ON public.billing_accounts;
CREATE POLICY helixa_billing_accounts_select ON public.billing_accounts
  FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.helixa_is_admin());

DROP POLICY IF EXISTS helixa_usage_meters_select ON public.usage_meters;
CREATE POLICY helixa_usage_meters_select ON public.usage_meters
  FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.helixa_is_admin());

DROP POLICY IF EXISTS helixa_client_prices_select ON public.client_workspace_prices;
CREATE POLICY helixa_client_prices_select ON public.client_workspace_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = agency_id AND (a.owner_account_id = auth.uid() OR public.helixa_is_admin())
    )
  );

DROP POLICY IF EXISTS helixa_client_invoices_select ON public.client_invoices;
CREATE POLICY helixa_client_invoices_select ON public.client_invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = agency_id AND (a.owner_account_id = auth.uid() OR public.helixa_is_admin())
    )
  );



-- --------------------------------------------------------
-- START OF FILE: 20260930_phase7_tiktok_windows.sql
-- --------------------------------------------------------

-- TikTok DM windows: 10 business messages in the 48 hours after each user message.
-- Run after 20260930_phase7_launch.sql. Do not run this from the app.
-- Idempotent. It does not delete tenant rows.

CREATE TABLE IF NOT EXISTS public.tiktok_dm_windows (
  business_open_id text NOT NULL,
  contact_external_id text NOT NULL,
  window_started_at timestamptz NOT NULL,
  business_sends integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_open_id, contact_external_id)
);

ALTER TABLE public.tiktok_dm_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tiktok_dm_windows FROM anon, authenticated;



-- --------------------------------------------------------
-- START OF FILE: 20261002120000_payment_ledger.sql
-- --------------------------------------------------------

-- Payment ledger for merchant commerce (Paymob/Tap) and platform-billing receipts.
-- Each callback now binds to the stored payment intent using the id the provider
-- signed, never body metadata, and guards every row on status='pending' so a
-- replay is a no-op.
--
-- RLS: billing_accounts owns entitlements. This ledger is write-once for a given
-- provider/transaction id and is read by the receipts router; it does not change
-- what a tenant may do. Impose grants as in your deployment (admin/service_role).

-- payment_intents: the single source of truth the callbacks verify against
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  order_id text,            -- legacy orders.id the merchant_order_id pointed at (nullable)
  invoice_id uuid,          -- client_invoices.id (nullable)
  provider text NOT NULL,   -- paymob | tap | stripe
  provider_order_id text NOT NULL,  -- Paymob obj.id / Tap charge id / Stripe session id
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending | paid | cancelled | failed
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_provider_check') THEN
    ALTER TABLE public.payment_intents
      ADD CONSTRAINT payment_intents_provider_check
      CHECK (provider IN ('paymob', 'tap', 'stripe'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_provider_order
  ON public.payment_intents (provider, provider_order_id);

-- payment_receipts: idempotent log for every successful capture, keyed by the
-- provider's own transaction id so replays never duplicate a receipt.
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_order_id text NOT NULL,
  transaction_id text NOT NULL,   -- provider's transaction/charge id
  account_id uuid NOT NULL,
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reminders_sent boolean NOT NULL DEFAULT false
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_receipts_provider_check') THEN
    ALTER TABLE public.payment_receipts
      ADD CONSTRAINT payment_receipts_provider_check
      CHECK (provider IN ('paymob', 'tap', 'stripe'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_transaction
  ON public.payment_receipts (provider, transaction_id);

