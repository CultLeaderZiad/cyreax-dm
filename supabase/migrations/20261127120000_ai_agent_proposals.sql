-- AI Growth Agent: changes the agent suggests. Nothing is applied until the
-- customer confirms; the confirm endpoint re-checks ownership and plan access.
--
-- Accessed only through the service role (RLS on, no policies).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ai_agent_proposals;

CREATE TABLE IF NOT EXISTS public.ai_agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  action text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed', 'failed')),
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_agent_proposals_account_idx ON public.ai_agent_proposals (account_id, created_at DESC);
ALTER TABLE public.ai_agent_proposals ENABLE ROW LEVEL SECURITY;
