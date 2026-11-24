-- Attach the three live Whop plans to Starter / Pro / Agency, and retire the
-- placeholder plans that scripts/17-migrate-plans-schema.sql seeded.
--
-- * Whop IDs are only written where the plan has none yet, so an id the admin
--   already set in Admin -> Plans is never overwritten. The admin can change
--   them any time.
-- * A sold plan that does not exist yet is created from the code catalog.
-- * The seeded "Monthly Plan" / "Yearly Plan" / "Lifetime Deal" rows are
--   hidden (is_active = false), not deleted, when they are not tied to a tier.
--
-- Rollback (data only, nothing structural changes):
--   UPDATE public.plans SET whop_variant_id = NULL
--     WHERE whop_variant_id IN ('plan_IBbNH8TGcs1np','plan_JtjPwHcMVU9lU','plan_CeX9JWzui6yd7');
--   UPDATE public.plans SET is_active = true
--     WHERE name IN ('Monthly Plan','Yearly Plan','Lifetime Deal') AND catalog_plan_id IS NULL;

INSERT INTO public.plans (name, description, price_usd, billing_cycle, features, is_active, catalog_plan_id)
SELECT v.name, v.description, v.price, 'monthly', '[]'::jsonb, true, v.tier
FROM (VALUES
  ('Starter', 'For creators getting started', 19.99, 'creator'),
  ('Pro',     'For growing brands',           29.99, 'creator_plus'),
  ('Agency',  'For agencies and teams',       44.99, 'agency')
) AS v(name, description, price, tier)
WHERE NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.catalog_plan_id = v.tier AND p.billing_cycle = 'monthly');

UPDATE public.plans p
SET whop_variant_id = v.whop_id, updated_at = now()
FROM (VALUES
  ('creator',      'plan_IBbNH8TGcs1np'),
  ('creator_plus', 'plan_JtjPwHcMVU9lU'),
  ('agency',       'plan_CeX9JWzui6yd7')
) AS v(tier, whop_id)
WHERE p.catalog_plan_id = v.tier
  AND p.billing_cycle = 'monthly'
  AND p.whop_variant_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.plans q WHERE q.whop_variant_id = v.whop_id);

UPDATE public.plans
SET is_active = false, updated_at = now()
WHERE name IN ('Monthly Plan', 'Yearly Plan', 'Lifetime Deal')
  AND catalog_plan_id IS NULL
  AND whop_variant_id IS NULL;
