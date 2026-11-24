-- Admin-controlled entitlements per plan.
--
-- plans.entitlements is a jsonb object that overrides the code defaults in
-- lib/billing/plans.ts for the plan whose catalog_plan_id matches. Keys:
--   workspaces, channels, contacts, aiReplies, broadcasts, seats  (integer, -1 = unlimited)
--   whiteLabel, apiAccess, aiAgent                                (boolean)
--   insights                                                      ('none' | 'weekly' | 'daily')
-- The server validates every write (sanitizeEntitlements) and enforcement
-- reads it on each request (resolveAccountPlan), so changing a limit or a
-- feature in Admin -> Plans takes effect immediately, with no deploy.
-- NULL = use the code defaults.
--
-- Additive. ROLLBACK:
--   ALTER TABLE public.plans DROP COLUMN IF EXISTS entitlements;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS entitlements jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_entitlements_object_check') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_entitlements_object_check
      CHECK (entitlements IS NULL OR jsonb_typeof(entitlements) = 'object');
  END IF;
END $$;
