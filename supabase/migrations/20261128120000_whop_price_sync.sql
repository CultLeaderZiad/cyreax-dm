-- Prices follow Whop: records when each plan's price was last read from Whop.
--
-- Rollback:
--   ALTER TABLE public.plans DROP COLUMN IF EXISTS whop_synced_at;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS whop_synced_at timestamptz;
