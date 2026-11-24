-- AI Recommendations: one stored batch per account per period (day for Pro and
-- Agency, ISO week for Starter). A stored batch is what enforces the refresh
-- frequency of each plan; the cards inside are computed from real account data.
--
-- Accessed only through the service role (RLS on, no policies).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ai_recommendations;

CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, period_key)
);
CREATE INDEX IF NOT EXISTS ai_recommendations_account_generated_idx ON public.ai_recommendations (account_id, generated_at DESC);
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
