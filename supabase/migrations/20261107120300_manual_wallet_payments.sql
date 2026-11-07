-- Manual plan payments from any Egyptian e-wallet or InstaPay, with proof
-- screenshots and admin review. Extends the existing payment_submissions
-- table (scripts/12, scripts/17) instead of adding a parallel one.
--
-- Additive: new nullable columns, new indexes, a new audit table, a private
-- storage bucket, narrow RLS policies and one SECURITY DEFINER function.
-- The only replaced object is the payment_method CHECK constraint, widened
-- to the new values (it previously rejected 'email', so that option already
-- failed to save).
--
-- ROLLBACK (drops the new data; existing rows and columns are untouched):
--   DROP FUNCTION IF EXISTS public.cyreax_review_payment(uuid, text, uuid, text, text);
--   DROP TABLE IF EXISTS public.payment_events;
--   DROP INDEX IF EXISTS public.payment_submissions_txref_per_method;
--   DROP INDEX IF EXISTS public.payment_submissions_reference_code_key;
--   DROP INDEX IF EXISTS public.payment_submissions_account_status_idx;
--   DROP POLICY IF EXISTS cyreax_payment_submissions_own_select ON public.payment_submissions;
--   DROP POLICY IF EXISTS cyreax_payment_proofs_owner_read ON storage.objects;
--   -- storage objects must be deleted (Dashboard > Storage) before the bucket:
--   DELETE FROM storage.buckets WHERE id = 'payment-proofs';
--   ALTER TABLE public.payment_submissions DROP CONSTRAINT IF EXISTS payment_submissions_payment_method_check;
--   ALTER TABLE public.payment_submissions ADD CONSTRAINT payment_submissions_payment_method_check
--     CHECK (payment_method IN ('stripe', 'vodafone_cash'));   -- only if no wallet/instapay rows remain
--   ALTER TABLE public.payment_submissions DROP COLUMN IF EXISTS account_id, DROP COLUMN IF EXISTS workspace_id,
--     DROP COLUMN IF EXISTS plan_slug, DROP COLUMN IF EXISTS interval, DROP COLUMN IF EXISTS amount_egp,
--     DROP COLUMN IF EXISTS amount_paid_egp, DROP COLUMN IF EXISTS sender_ref, DROP COLUMN IF EXISTS reference_code,
--     DROP COLUMN IF EXISTS proof_path, DROP COLUMN IF EXISTS transferred_at, DROP COLUMN IF EXISTS admin_note,
--     DROP COLUMN IF EXISTS reviewed_by_account, DROP COLUMN IF EXISTS period_end;
--   ALTER TABLE public.plans DROP COLUMN IF EXISTS price_egp, DROP COLUMN IF EXISTS price_yearly_egp,
--     DROP COLUMN IF EXISTS catalog_plan_id;

BEGIN;

-- 1. EGP prices and the entitlement plan each display plan grants ----------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_egp numeric(12, 2);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_yearly_egp numeric(12, 2);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS catalog_plan_id text;

-- 2. payment_submissions -----------------------------------------------------
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS plan_id uuid;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS proof_note text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS plan_slug text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS interval text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS amount_egp numeric(12, 2);
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS amount_paid_egp numeric(12, 2);
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS sender_ref text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS reference_code text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS proof_path text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS transferred_at timestamptz;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS admin_note text;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS reviewed_by_account uuid;
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS period_end timestamptz;

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.payment_submissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.payment_submissions DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE public.payment_submissions
    ADD CONSTRAINT payment_submissions_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('wallet', 'instapay', 'vodafone_cash', 'email', 'stripe'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_submissions_interval_check') THEN
    ALTER TABLE public.payment_submissions
      ADD CONSTRAINT payment_submissions_interval_check
      CHECK (interval IS NULL OR interval IN ('month', 'year', 'lifetime'));
  END IF;
END $$;

-- One proof per transaction number per method (blocks re-using a receipt).
-- Scoped to the new methods so older free-text rows cannot block the index.
CREATE UNIQUE INDEX IF NOT EXISTS payment_submissions_txref_per_method
  ON public.payment_submissions (payment_method, upper(transaction_reference))
  WHERE payment_method IN ('wallet', 'instapay');
CREATE UNIQUE INDEX IF NOT EXISTS payment_submissions_reference_code_key
  ON public.payment_submissions (reference_code)
  WHERE reference_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_submissions_account_status_idx
  ON public.payment_submissions (account_id, status, created_at DESC);

-- Customers read their own rows; only the server (service role) writes.
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_submissions FROM anon, authenticated;
DROP POLICY IF EXISTS cyreax_payment_submissions_own_select ON public.payment_submissions;
CREATE POLICY cyreax_payment_submissions_own_select ON public.payment_submissions
  FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.helixa_is_admin());

-- 3. Audit trail of every submit / approve / reject ----------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  actor_account_id uuid,
  action text NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON public.payment_events (payment_id, created_at);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM anon, authenticated;
DROP POLICY IF EXISTS cyreax_payment_events_admin_select ON public.payment_events;
CREATE POLICY cyreax_payment_events_admin_select ON public.payment_events
  FOR SELECT TO authenticated USING (public.helixa_is_admin());
GRANT SELECT ON public.payment_events TO authenticated;

-- 4. Private bucket for proof screenshots ------------------------------------
-- Objects live at payment-proofs/<account_id>/<payment_id>.<ext>. Uploads are
-- done by the server after validation; the owner may read their own folder;
-- admins see proofs only through short-lived signed URLs made by the server.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

DROP POLICY IF EXISTS cyreax_payment_proofs_owner_read ON storage.objects;
CREATE POLICY cyreax_payment_proofs_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Review in one transaction -------------------------------------------------
-- Locks the payment row, refuses anything not pending (so a double click or a
-- retry is a no-op that returns the first result), extends the period from
-- the later of now() and the current paid period end, writes billing_accounts
-- and the legacy mirrors, and logs the event, all or nothing.
CREATE OR REPLACE FUNCTION public.cyreax_review_payment(
  p_payment_id uuid,
  p_action text,
  p_admin_account uuid,
  p_note text DEFAULT NULL,
  p_fallback_plan text DEFAULT NULL
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
  plan := COALESCE(NULLIF(pay.plan_slug, ''), NULLIF(p_fallback_plan, ''));
  IF plan IS NULL THEN
    RAISE EXCEPTION 'payment % has no plan', p_payment_id;
  END IF;
  ivl := COALESCE(pay.interval, 'month');

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
    grace_until, dunning_step, updated_at
  ) VALUES (
    acct, plan, 'active', CASE WHEN ivl = 'year' THEN 'year' ELSE 'month' END,
    pay.payment_method, pay.id::text, new_end, NULL, false, NULL, NULL, 0, now()
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
    updated_at = now();

  -- Legacy mirrors read by older screens (same values activatePlan writes).
  UPDATE public.accounts SET plan = 'monthly', trial_ends_at = NULL, updated_at = now() WHERE id = acct;
  UPDATE public.users SET plan = 'monthly', trial_ends_at = NULL, updated_at = now() WHERE account_id = acct;
  BEGIN
    SELECT u.id INTO legacy_user FROM public.users u WHERE u.account_id = acct ORDER BY u.id LIMIT 1;
    IF legacy_user IS NOT NULL AND to_regclass('public.subscriptions') IS NOT NULL THEN
      EXECUTE 'INSERT INTO public.subscriptions (user_id, stripe_subscription_id, plan_type, status, current_period_end, updated_at)
               VALUES ($1, $2, ''monthly'', ''active'', $3, now())
               ON CONFLICT (user_id) DO UPDATE SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                 plan_type = ''monthly'', status = ''active'', current_period_end = EXCLUDED.current_period_end, updated_at = now()'
        USING legacy_user, pay.id::text, new_end;
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
    VALUES (p_payment_id, p_admin_account, 'approved', p_note);

  RETURN jsonb_build_object('result', 'approved', 'account_id', acct, 'plan', plan, 'period_end', new_end);
END;
$$;

REVOKE ALL ON FUNCTION public.cyreax_review_payment(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cyreax_review_payment(uuid, text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cyreax_review_payment(uuid, text, uuid, text, text) TO service_role;

COMMIT;
