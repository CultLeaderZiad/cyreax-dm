-- Minute-level scheduler for the cron routes, run by Supabase itself
-- (pg_cron + pg_net). Replaces the GitHub Actions schedule, which GitHub can
-- delay by many minutes and pauses after 60 days without repo activity, so a
-- flow "wait 5 min" step could take 20+ minutes or stop entirely.
--
-- Before running: Supabase Dashboard -> Database -> Extensions: enable
-- pg_cron and pg_net (or let the CREATE EXTENSION lines below do it).
--
-- After running, store two secrets ONCE in the SQL editor (values never go in git):
--   select vault.create_secret('https://YOUR-DOMAIN', 'cyreax_cron_base_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'cyreax_cron_secret');
-- Until both exist, every job is a no-op (nothing fails, nothing is called).
--
-- Then you can disable .github/workflows/scheduled-jobs.yml (it is harmless to
-- keep as a backup: every route is idempotent and lease-based).
--
-- Additive. ROLLBACK:
--   select cron.unschedule(jobname) from cron.job where jobname like 'cyreax_%';
--   DROP FUNCTION IF EXISTS public.cyreax_call_cron(text);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.cyreax_call_cron(job text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base text;
  secret text;
BEGIN
  IF job !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'bad job name';
  END IF;
  SELECT decrypted_secret INTO base FROM vault.decrypted_secrets WHERE name = 'cyreax_cron_base_url' LIMIT 1;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'cyreax_cron_secret' LIMIT 1;
  IF base IS NULL OR secret IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_get(
    url := rtrim(base, '/') || '/api/cron/' || job,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cyreax_call_cron(text) FROM PUBLIC, anon, authenticated;

-- Re-runnable: drop our jobs first, then schedule them again.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'cyreax_%';

SELECT cron.schedule('cyreax_process_inbound', '* * * * *', $$select public.cyreax_call_cron('process-inbound-events')$$);
SELECT cron.schedule('cyreax_campaigns', '*/5 * * * *', $$select public.cyreax_call_cron('send-scheduled-campaigns')$$);
SELECT cron.schedule('cyreax_tiktok_tokens', '17 */12 * * *', $$select public.cyreax_call_cron('refresh-tiktok-tokens')$$);
SELECT cron.schedule('cyreax_meta_token_health', '37 */6 * * *', $$select public.cyreax_call_cron('meta-token-health')$$);
SELECT cron.schedule('cyreax_dunning', '23 4 * * *', $$select public.cyreax_call_cron('dunning')$$);
SELECT cron.schedule('cyreax_client_reports', '41 5 * * *', $$select public.cyreax_call_cron('client-reports')$$);
