-- Behavioural checks for the security/payment migrations. Each block raises
-- on failure; psql -v ON_ERROR_STOP=1 turns that into a non-zero exit.
\set A    '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B    '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set ADM  '''dddddddd-0000-0000-0000-00000000000d'''

INSERT INTO public.accounts (id, email, role) VALUES
  (:A, 'a@test.local', 'customer'), (:B, 'b@test.local', 'customer'), (:ADM, 'admin@test.local', 'admin');
INSERT INTO public.users (id, account_id, username) VALUES (1001, :A, 'a'), (2002, :B, 'b'), (9009, :ADM, 'admin');
INSERT INTO public.app_settings (key, value) VALUES
  ('update_banner', '{"isActive":false}'), ('updates_page', '{"isEnabled":true}'), ('smtp_settings', '{"user":"u","pass_encrypted":"x"}');
INSERT INTO public.payment_submissions (id, user_id, account_id, transaction_reference, amount, amount_egp, payment_method, interval, plan_slug, reference_code, proof_path)
VALUES
  ('11111111-0000-0000-0000-000000000001', 1001, :A, 'TX-1001', 1450, 1450, 'wallet',   'month', 'creator', 'CX-AAAAA1', :A || '/11111111-0000-0000-0000-000000000001.png'),
  ('11111111-0000-0000-0000-000000000002', 1001, :A, 'TX-1002', 1450, 1450, 'instapay', 'month', 'creator', 'CX-AAAAA2', NULL),
  ('11111111-0000-0000-0000-000000000003', 1001, :A, 'TX-1003', 1450, 1450, 'wallet',   'month', 'creator', 'CX-AAAAA3', NULL),
  ('22222222-0000-0000-0000-000000000001', 2002, :B, 'TX-2001', 1450, 1450, 'wallet',   'year',  'creator_plus', 'CX-BBBBB1', NULL);
INSERT INTO storage.objects (bucket_id, name) VALUES ('payment-proofs', 'aaaaaaaa-0000-0000-0000-00000000000a/11111111-0000-0000-0000-000000000001.png');

-- 1. The same transaction number cannot be reused for the same method (any case).
DO $$ BEGIN
  BEGIN
    INSERT INTO public.payment_submissions (user_id, transaction_reference, amount, payment_method) VALUES (2002, 'tx-1001', 1, 'wallet');
    RAISE EXCEPTION 'FAIL: duplicate wallet transaction reference was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.payment_submissions (user_id, transaction_reference, amount, payment_method, reference_code) VALUES (2002, 'NEW-1', 1, 'wallet', 'CX-AAAAA1');
    RAISE EXCEPTION 'FAIL: duplicate reference code was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.payment_submissions (user_id, transaction_reference, amount, payment_method) VALUES (2002, 'X-1', 1, 'paypal');
    RAISE EXCEPTION 'FAIL: unknown payment method was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- 2. Only an admin can review.
DO $$ BEGIN
  BEGIN
    PERFORM public.cyreax_review_payment('11111111-0000-0000-0000-000000000001', 'approve', 'bbbbbbbb-0000-0000-0000-00000000000b');
    RAISE EXCEPTION 'FAIL: non-admin approved a payment';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%not an admin%' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.payment_submissions WHERE id = '11111111-0000-0000-0000-000000000001') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL: non-admin attempt changed the payment';
  END IF;
END $$;

-- 3. Approve activates the plan for one month; approving again changes nothing.
DO $$
DECLARE r jsonb; r2 jsonb; first_end timestamptz;
BEGIN
  r := public.cyreax_review_payment('11111111-0000-0000-0000-000000000001', 'approve', 'dddddddd-0000-0000-0000-00000000000d', 'looks good');
  IF r->>'result' <> 'approved' THEN RAISE EXCEPTION 'FAIL: approve returned %', r; END IF;
  SELECT current_period_end INTO first_end FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  IF first_end IS NULL OR abs(extract(epoch FROM first_end - (now() + interval '1 month'))) > 5 THEN
    RAISE EXCEPTION 'FAIL: first approval period end %', first_end;
  END IF;
  IF (SELECT plan FROM public.accounts WHERE id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> 'monthly' THEN
    RAISE EXCEPTION 'FAIL: accounts mirror not updated';
  END IF;

  r2 := public.cyreax_review_payment('11111111-0000-0000-0000-000000000001', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  IF r2->>'result' <> 'already_reviewed' THEN RAISE EXCEPTION 'FAIL: second approve returned %', r2; END IF;
  IF (SELECT current_period_end FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> first_end THEN
    RAISE EXCEPTION 'FAIL: approving twice extended the plan twice';
  END IF;
  IF (SELECT count(*) FROM public.payment_events WHERE payment_id = '11111111-0000-0000-0000-000000000001' AND action = 'approved') <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one approved event';
  END IF;

  -- 4. A renewal extends from the current period end, not from today.
  r := public.cyreax_review_payment('11111111-0000-0000-0000-000000000002', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  IF (SELECT current_period_end FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> first_end + interval '1 month' THEN
    RAISE EXCEPTION 'FAIL: renewal did not extend from the existing period end';
  END IF;
END $$;

-- 5. Reject stores the reason and leaves billing alone; a later approve is refused.
DO $$
DECLARE before timestamptz; r jsonb;
BEGIN
  SELECT current_period_end INTO before FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  r := public.cyreax_review_payment('11111111-0000-0000-0000-000000000003', 'reject', 'dddddddd-0000-0000-0000-00000000000d', 'Amount does not match');
  IF r->>'result' <> 'rejected' THEN RAISE EXCEPTION 'FAIL: reject returned %', r; END IF;
  IF (SELECT admin_note FROM public.payment_submissions WHERE id = '11111111-0000-0000-0000-000000000003') <> 'Amount does not match' THEN
    RAISE EXCEPTION 'FAIL: rejection note not stored';
  END IF;
  r := public.cyreax_review_payment('11111111-0000-0000-0000-000000000003', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  IF r->>'result' <> 'already_reviewed' OR (SELECT current_period_end FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> before THEN
    RAISE EXCEPTION 'FAIL: a rejected payment was approved later';
  END IF;
END $$;

-- 6. Yearly plan for B.
DO $$ BEGIN
  PERFORM public.cyreax_review_payment('22222222-0000-0000-0000-000000000001', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  IF (SELECT abs(extract(epoch FROM current_period_end - (now() + interval '1 year'))) FROM public.billing_accounts WHERE account_id = 'bbbbbbbb-0000-0000-0000-00000000000b') > 5
     OR (SELECT plan_id FROM public.billing_accounts WHERE account_id = 'bbbbbbbb-0000-0000-0000-00000000000b') <> 'creator_plus' THEN
    RAISE EXCEPTION 'FAIL: yearly approval';
  END IF;
END $$;

-- 7. RLS and grants, as the browser roles see them.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.payment_submissions WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B can read user A payments';
  END IF;
  IF (SELECT count(*) FROM public.payment_submissions) <> 1 THEN RAISE EXCEPTION 'FAIL: user B should see exactly their own payment'; END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'payment-proofs') <> 0 THEN RAISE EXCEPTION 'FAIL: user B can see user A proof'; END IF;
  IF (SELECT count(*) FROM public.payment_events) <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin can read payment audit log'; END IF;
  BEGIN
    UPDATE public.payment_submissions SET status = 'approved' WHERE account_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
    RAISE EXCEPTION 'FAIL: customer could update payment status';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.payment_submissions (user_id, transaction_reference, amount, status) VALUES (2002, 'SELF', 1, 'approved');
    RAISE EXCEPTION 'FAIL: customer could insert a payment row directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.cyreax_review_payment('22222222-0000-0000-0000-000000000001', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
    RAISE EXCEPTION 'FAIL: customer could call the review function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.outbound_sends;
    RAISE EXCEPTION 'FAIL: customer can read outbound_sends';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.payment_submissions) <> 3 THEN RAISE EXCEPTION 'FAIL: user A should see their 3 payments'; END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'payment-proofs') <> 1 THEN RAISE EXCEPTION 'FAIL: owner cannot read own proof'; END IF;
END $$;
RESET ROLE;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.payment_submissions) <> 0 THEN RAISE EXCEPTION 'FAIL: anon can read payments'; END IF;
  IF (SELECT count(*) FROM storage.objects) <> 0 THEN RAISE EXCEPTION 'FAIL: anon can read storage objects'; END IF;
  IF EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'smtp_settings') THEN RAISE EXCEPTION 'FAIL: anon can read smtp_settings'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'update_banner') THEN RAISE EXCEPTION 'FAIL: banner no longer public'; END IF;
  IF (SELECT count(*) FROM public.plans) <> 0 THEN RAISE EXCEPTION 'FAIL: plans readable by anon under RLS'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'x.png');
    RAISE EXCEPTION 'FAIL: anon can still upload to the media bucket';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plans SET price_usd = 0;
    RAISE EXCEPTION 'FAIL: anon can update plan prices';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM public.sessions;
    RAISE EXCEPTION 'FAIL: anon can read sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- 8. Private bucket config.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs' AND public = false AND file_size_limit = 5242880) THEN
    RAISE EXCEPTION 'FAIL: payment-proofs bucket is not private / size-limited';
  END IF;
END $$;

-- 9. Support tickets: owner-only reads, no direct writes.
INSERT INTO public.support_tickets (id, account_id, subject) VALUES ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Help please');
INSERT INTO public.support_messages (ticket_id, author_role, body) VALUES ('33333333-0000-0000-0000-000000000001', 'customer', 'secret details');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.support_tickets) <> 0 OR (SELECT count(*) FROM public.support_messages) <> 0 THEN
    RAISE EXCEPTION 'FAIL: user B can read user A support ticket';
  END IF;
  BEGIN
    INSERT INTO public.support_messages (ticket_id, author_role, body) VALUES ('33333333-0000-0000-0000-000000000001', 'admin', 'fake admin');
    RAISE EXCEPTION 'FAIL: customer could write a support message directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.support_messages) <> 1 THEN RAISE EXCEPTION 'FAIL: owner cannot read own ticket messages'; END IF;
END $$;
RESET ROLE;

SELECT 'ALL DB CHECKS PASSED' AS result;
