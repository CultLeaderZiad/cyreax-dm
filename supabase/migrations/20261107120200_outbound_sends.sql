-- At-most-once outbound replies (lib/channels/send-once.ts).
-- One row per (inbound message/comment id, contact, purpose). A retried event
-- that already sent finds the row and skips the provider call.
-- Until this is applied the app sends exactly as before (no dedupe).
--
-- Additive. ROLLBACK:  DROP TABLE IF EXISTS public.outbound_sends;

BEGIN;

CREATE TABLE IF NOT EXISTS public.outbound_sends (
  send_key   text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_sends_created_at_idx ON public.outbound_sends (created_at);

ALTER TABLE public.outbound_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_sends FROM anon, authenticated;

COMMIT;

-- Housekeeping (safe to run any time; retries never reach back this far):
--   DELETE FROM public.outbound_sends WHERE created_at < now() - interval '30 days';
