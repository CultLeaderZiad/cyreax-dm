-- P1-2: approval grants the plan that was actually bought.
--
-- 1. billing_accounts.display_plan_id: which row in public.plans was bought
--    (plan_agents is keyed by it), so agent access follows the purchase.
-- 2. cyreax_review_payment now:
--    - takes the entitlement plan from plans.catalog_plan_id of the quote's
--      plan_id (then the quoted slug, then the legacy fallback);
--    - stores interval 'month' | 'year' | 'lifetime'. Lifetime used to be
--      stored as interval 'month' with a NULL end; now it is the explicit
--      'lifetime' marker that lib/billing/enforce.ts checks;
--    - writes accounts.plan / users.plan as 'one_time' for lifetime and
--      'monthly' otherwise (legacy markers for admin stats only).
-- 3. Backfill: rows approved as lifetime before this change get
--    interval = 'lifetime'; display_plan_id is filled from the latest
--    approved payment.
--
-- Additive. ROLLBACK:
--   re-run 20261117120100_review_payment_underpay_guard.sql (restores the
--   previous function body), then:
--   UPDATE public.billing_accounts SET interval = 'month' WHERE interval = 'lifetime';
--   ALTER TABLE public.billing_accounts DROP COLUMN IF EXISTS display_plan_id;

BEGIN;

ALTER TABLE public.billing_accounts ADD COLUMN IF NOT EXISTS display_plan_id uuid;

-- Backfill lifetime purchases that were stored as month + NULL end.
UPDATE public.billing_accounts b
SET interval = 'lifetime'
WHERE b.interval = 'month'
  AND b.current_period_end IS NULL
  AND b.status = 'active'
  AND EXISTS (
    SELECT 1 FROM public.payment_submissions p
    WHERE p.status = 'approved' AND p.interval = 'lifetime'
      AND p.id::text = b.provider_subscription_id
  );

-- Which display plan each manual purchase was for.
UPDATE public.billing_accounts b
SET display_plan_id = p.plan_id
FROM public.payment_submissions p
WHERE b.display_plan_id IS NULL
  AND p.id::text = b.provider_subscription_id
  AND p.status = 'approved'
  AND p.plan_id IS NOT NULL;

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
    grace_until, dunning_step, updated_at, display_plan_id
  ) VALUES (
    acct, plan, 'active', ivl,
    pay.payment_method, pay.id::text, new_end, NULL, false, NULL, NULL, 0, now(), pay.plan_id
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
