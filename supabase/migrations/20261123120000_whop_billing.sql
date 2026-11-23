-- Whop as the card payment provider, next to the Egypt-only manual
-- wallet / InstaPay flow. Additive.
--
-- 1. plans.whop_variant_id / whop_variant_id_yearly: the Whop plan
--    ("variant", id prefixed plan_) sold for each of our plans. Lifetime plans
--    use whop_variant_id.
-- 2. accounts.country: ISO 3166-1 alpha-2 country the customer saved
--    (decides whether the Egypt-only manual methods are offered).
-- 3. billing_accounts.payment_provider: 'whop' | 'manual'. Both providers write
--    the same billing_accounts fields, so entitlement does not care which paid.
-- 4. whop_checkouts: one row per checkout we create. Its random ref is put in
--    the Whop checkout metadata; the webhook only trusts metadata whose ref
--    matches a row for the same account and plan (forged metadata is ignored).
-- 5. whop_webhook_events: idempotency by Whop's webhook-id.
-- 6. cyreax_review_payment also writes payment_provider = 'manual'.
--
-- ROLLBACK:
--   re-run 20261117120200_review_payment_plan_and_lifetime.sql (previous function body), then:
--   DROP TABLE IF EXISTS public.whop_webhook_events;
--   DROP TABLE IF EXISTS public.whop_checkouts;
--   ALTER TABLE public.billing_accounts DROP COLUMN IF EXISTS payment_provider;
--   ALTER TABLE public.accounts DROP COLUMN IF EXISTS country;
--   ALTER TABLE public.plans DROP COLUMN IF EXISTS whop_variant_id_yearly, DROP COLUMN IF EXISTS whop_variant_id;

BEGIN;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS whop_variant_id text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS whop_variant_id_yearly text;
CREATE UNIQUE INDEX IF NOT EXISTS plans_whop_variant_id_key ON public.plans (whop_variant_id) WHERE whop_variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plans_whop_variant_id_yearly_key ON public.plans (whop_variant_id_yearly) WHERE whop_variant_id_yearly IS NOT NULL;

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS country text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_country_check') THEN
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_country_check CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
  END IF;
END $$;

ALTER TABLE public.billing_accounts ADD COLUMN IF NOT EXISTS payment_provider text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_accounts_payment_provider_check') THEN
    ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_payment_provider_check
      CHECK (payment_provider IS NULL OR payment_provider IN ('whop', 'manual'));
  END IF;
END $$;
UPDATE public.billing_accounts SET payment_provider = 'manual'
  WHERE payment_provider IS NULL AND provider IN ('wallet', 'instapay', 'vodafone_cash');

CREATE TABLE IF NOT EXISTS public.whop_checkouts (
  ref uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  interval text NOT NULL CHECK (interval IN ('month', 'year', 'lifetime')),
  whop_variant_id text NOT NULL,
  checkout_configuration_id text,
  membership_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whop_checkouts_account_idx ON public.whop_checkouts (account_id);
CREATE INDEX IF NOT EXISTS whop_checkouts_membership_idx ON public.whop_checkouts (membership_id);
ALTER TABLE public.whop_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whop_checkouts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.whop_webhook_events (
  webhook_id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result text
);
ALTER TABLE public.whop_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whop_webhook_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cyreax_review_payment(
  p_payment_id uuid,
  p_action text,
  p_admin_account uuid,
  p_note text DEFAULT NULL,
  p_fallback_plan text DEFAULT NULL,
  p_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payment_submissions%ROWTYPE;
  cur public.billing_accounts%ROWTYPE;
  has_cur boolean;
  acct uuid;
  plan text;
  ivl text;
  base timestamptz;
  new_end timestamptz;
  legacy_user bigint;
  event_note text;
  legacy_plan text;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = p_admin_account AND a.role = 'admin') THEN
    RAISE EXCEPTION 'reviewer is not an admin';
  END IF;

  SELECT * INTO pay FROM public.payment_submissions WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF pay.status <> 'pending' THEN
    RETURN jsonb_build_object('result', 'already_reviewed', 'status', pay.status, 'period_end', pay.period_end);
  END IF;

  acct := COALESCE(pay.account_id, (SELECT u.account_id FROM public.users u WHERE u.id = pay.user_id));

  IF p_action = 'reject' THEN
    UPDATE public.payment_submissions
      SET status = 'rejected', admin_note = p_note, rejection_reason = p_note,
          reviewed_by_account = p_admin_account, reviewed_at = now(), updated_at = now()
      WHERE id = p_payment_id;
    INSERT INTO public.payment_events (payment_id, actor_account_id, action, note)
      VALUES (p_payment_id, p_admin_account, 'rejected', p_note);
    RETURN jsonb_build_object('result', 'rejected', 'account_id', acct);
  END IF;

  IF acct IS NULL THEN
    RAISE EXCEPTION 'payment % has no account', p_payment_id;
  END IF;
  -- The plan that was bought: the display plan's entitlement (catalog) plan,
  -- then the slug signed into the quote, then the caller's legacy fallback.
  plan := COALESCE(
    (SELECT NULLIF(pl.catalog_plan_id, '') FROM public.plans pl WHERE pl.id = pay.plan_id),
    NULLIF(pay.plan_slug, ''),
    NULLIF(p_fallback_plan, '')
  );
  IF plan IS NULL THEN
    RAISE EXCEPTION 'payment % has no plan', p_payment_id;
  END IF;
  ivl := CASE WHEN pay.interval IN ('month', 'year', 'lifetime') THEN pay.interval ELSE 'month' END;

  -- Underpayment guard. amount_egp is the signed quote; amount_paid_egp is
  -- what the customer says they sent. Approving less (or an unknown amount)
  -- needs an explicit override with a note, recorded on the payment event.
  event_note := p_note;
  IF pay.amount_egp IS NOT NULL AND (pay.amount_paid_egp IS NULL OR pay.amount_paid_egp < pay.amount_egp) THEN
    IF NOT COALESCE(p_override, false) THEN
      RETURN jsonb_build_object('result', 'underpaid', 'expected_egp', pay.amount_egp, 'paid_egp', pay.amount_paid_egp);
    END IF;
    IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NULL THEN
      RETURN jsonb_build_object('result', 'override_needs_note', 'expected_egp', pay.amount_egp, 'paid_egp', pay.amount_paid_egp);
    END IF;
    event_note := format('[override: paid %s of %s EGP] %s', COALESCE(pay.amount_paid_egp::text, 'unknown'), pay.amount_egp, p_note);
  END IF;

  SELECT * INTO cur FROM public.billing_accounts WHERE account_id = acct FOR UPDATE;
  has_cur := FOUND;

  IF ivl = 'lifetime' THEN
    new_end := NULL;
  ELSE
    base := now();
    IF has_cur AND cur.status IN ('active', 'past_due') AND cur.current_period_end > now() THEN
      base := cur.current_period_end;
    END IF;
    new_end := base + CASE WHEN ivl = 'year' THEN interval '1 year' ELSE interval '1 month' END;
  END IF;

  INSERT INTO public.billing_accounts (
    account_id, plan_id, status, interval, provider, provider_subscription_id,
    current_period_end, trial_ends_at, cancel_at_period_end, scheduled_plan_id,
    grace_until, dunning_step, updated_at, display_plan_id, payment_provider
  ) VALUES (
    acct, plan, 'active', ivl,
    pay.payment_method, pay.id::text, new_end, NULL, false, NULL, NULL, 0, now(), pay.plan_id, 'manual'
  )
  ON CONFLICT (account_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    interval = EXCLUDED.interval,
    provider = EXCLUDED.provider,
    provider_subscription_id = EXCLUDED.provider_subscription_id,
    current_period_end = EXCLUDED.current_period_end,
    trial_ends_at = NULL,
    cancel_at_period_end = false,
    scheduled_plan_id = NULL,
    grace_until = NULL,
    dunning_step = 0,
    display_plan_id = EXCLUDED.display_plan_id,
    payment_provider = 'manual',
    updated_at = now();

  -- Legacy mirrors read by older screens (same values activatePlan writes).
  -- accounts.plan / users.plan are legacy markers ("subscription" vs
  -- "one-time") used by admin stats. Entitlement reads billing_accounts.
  legacy_plan := CASE WHEN ivl = 'lifetime' THEN 'one_time' ELSE 'monthly' END;
  UPDATE public.accounts SET plan = legacy_plan, trial_ends_at = NULL, updated_at = now() WHERE id = acct;
  UPDATE public.users SET plan = legacy_plan, trial_ends_at = NULL, updated_at = now() WHERE account_id = acct;
  BEGIN
    SELECT u.id INTO legacy_user FROM public.users u WHERE u.account_id = acct ORDER BY u.id LIMIT 1;
    IF legacy_user IS NOT NULL AND to_regclass('public.subscriptions') IS NOT NULL THEN
      EXECUTE 'INSERT INTO public.subscriptions (user_id, stripe_subscription_id, plan_type, status, current_period_end, updated_at)
               VALUES ($1, $2, $4, ''active'', $3, now())
               ON CONFLICT (user_id) DO UPDATE SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                 plan_type = EXCLUDED.plan_type, status = ''active'', current_period_end = EXCLUDED.current_period_end, updated_at = now()'
        USING legacy_user, pay.id::text, new_end, legacy_plan;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- The subscriptions mirror is cosmetic; billing_accounts is the source of truth.
    RAISE WARNING 'subscriptions mirror skipped: %', SQLERRM;
  END;

  UPDATE public.payment_submissions
    SET status = 'approved', admin_note = p_note, plan_slug = plan, period_end = new_end,
        reviewed_by_account = p_admin_account, reviewed_at = now(), updated_at = now()
    WHERE id = p_payment_id;
  INSERT INTO public.payment_events (payment_id, actor_account_id, action, note)
    VALUES (p_payment_id, p_admin_account, 'approved', event_note);

  RETURN jsonb_build_object('result', 'approved', 'account_id', acct, 'plan', plan, 'interval', ivl, 'period_end', new_end);
END;
$$;

REVOKE ALL ON FUNCTION public.cyreax_review_payment(uuid, text, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cyreax_review_payment(uuid, text, uuid, text, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cyreax_review_payment(uuid, text, uuid, text, text, boolean) TO service_role;

COMMIT;
