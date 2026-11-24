-- Read-only check: did every recent migration land? Run it in the Supabase SQL
-- editor. Every row should say ok = true; a false row names what is missing,
-- and the migration file in supabase/migrations/ that creates it.
SELECT item, ok, fix FROM (
  VALUES
    ('table whop_checkouts',            to_regclass('public.whop_checkouts') IS NOT NULL,            '20261123120000_whop_billing.sql'),
    ('table whop_webhook_events',       to_regclass('public.whop_webhook_events') IS NOT NULL,       '20261123120000_whop_billing.sql'),
    ('plans.whop_variant_id',           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='whop_variant_id'),        '20261123120000_whop_billing.sql'),
    ('plans.whop_variant_id_yearly',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='whop_variant_id_yearly'), '20261123120000_whop_billing.sql'),
    ('plans.entitlements',              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='entitlements'),            '20261124120000_plan_entitlements.sql'),
    ('plans.whop_synced_at',            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='whop_synced_at'),          '20261128120000_whop_price_sync.sql'),
    ('table ai_recommendations',        to_regclass('public.ai_recommendations') IS NOT NULL,        '20261126120000_ai_recommendations.sql'),
    ('table ai_agent_proposals',        to_regclass('public.ai_agent_proposals') IS NOT NULL,        '20261127120000_ai_agent_proposals.sql'),
    ('table account_onboarding',        to_regclass('public.account_onboarding') IS NOT NULL,        '20261129120000_account_onboarding.sql'),
    ('onboarding review step',         EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_onboarding_status_check' AND pg_get_constraintdef(oid) LIKE '%approved%') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='account_onboarding' AND column_name='approved_at'), '20261130120000_onboarding_review.sql'),
    ('onboarding access step',         EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_onboarding_status_check' AND pg_get_constraintdef(oid) LIKE '%awaiting_access%') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='account_onboarding' AND column_name='access_approved_at'), '20261201120000_onboarding_access_step.sql'),
    ('Starter has its card plan id',    EXISTS (SELECT 1 FROM public.plans WHERE catalog_plan_id='creator'      AND whop_variant_id IS NOT NULL), '20261125120000_whop_plan_ids.sql'),
    ('Pro has its card plan id',        EXISTS (SELECT 1 FROM public.plans WHERE catalog_plan_id='creator_plus' AND whop_variant_id IS NOT NULL), '20261125120000_whop_plan_ids.sql'),
    ('Agency has its card plan id',     EXISTS (SELECT 1 FROM public.plans WHERE catalog_plan_id='agency'       AND whop_variant_id IS NOT NULL), '20261125120000_whop_plan_ids.sql'),
    ('old placeholder plans are hidden', NOT EXISTS (SELECT 1 FROM public.plans WHERE name IN ('Monthly Plan','Yearly Plan','Lifetime Deal') AND catalog_plan_id IS NULL AND is_active), '20261125120000_whop_plan_ids.sql')
) AS checks(item, ok, fix)
ORDER BY ok, item;
