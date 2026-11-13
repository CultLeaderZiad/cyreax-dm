-- Scheduled email campaigns: /api/cron/send-scheduled-campaigns reads
-- email_campaigns.scheduled_at. Same as scripts/40-add-campaign-scheduling.sql,
-- which had not been applied to production (the cron returned 500).
-- Applied to production 2026-11-13.
--
-- Additive. ROLLBACK:
--   ALTER TABLE public.email_campaigns DROP COLUMN IF EXISTS scheduled_at;
--   (and restore the previous status check without 'scheduled' if needed)

ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed'));
