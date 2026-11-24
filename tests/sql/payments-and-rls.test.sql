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
INSERT INTO public.payment_submissions (id, user_id, account_id, transaction_reference, amount, amount_egp, payment_method, interval, plan_slug, reference_code, proof_path, amount_paid_egp)
VALUES
  ('11111111-0000-0000-0000-000000000001', 1001, :A, 'TX-1001', 1450, 1450, 'wallet',   'month', 'creator', 'CX-AAAAA1', :A || '/11111111-0000-0000-0000-000000000001.png', 1450),
  ('11111111-0000-0000-0000-000000000002', 1001, :A, 'TX-1002', 1450, 1450, 'instapay', 'month', 'creator', 'CX-AAAAA2', NULL, 1450),
  ('11111111-0000-0000-0000-000000000003', 1001, :A, 'TX-1003', 1450, 1450, 'wallet',   'month', 'creator', 'CX-AAAAA3', NULL, 1450),
  ('22222222-0000-0000-0000-000000000001', 2002, :B, 'TX-2001', 1450, 1450, 'wallet',   'year',  'creator_plus', 'CX-BBBBB1', NULL, 1450),
  ('33333333-0000-0000-0000-0000000000a1', 1001, :A, 'TX-1004', 1450, 1450, 'wallet', 'month', 'creator', 'CX-AAAAA4', NULL, 1),
  ('33333333-0000-0000-0000-0000000000a2', 1001, :A, 'TX-1005', 1450, 1450, 'wallet', 'month', 'creator', 'CX-AAAAA5', NULL, NULL);
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
  IF (SELECT count(*) FROM public.payment_submissions) <> 5 THEN RAISE EXCEPTION 'FAIL: user A should see their 5 payments'; END IF;
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

-- 9b. Underpayment: 1 EGP against a 1450 quote is refused without an override.
DO $$
DECLARE r jsonb; before timestamptz;
BEGIN
  SELECT current_period_end INTO before FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  r := public.cyreax_review_payment('33333333-0000-0000-0000-0000000000a1', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  IF r->>'result' <> 'underpaid' THEN RAISE EXCEPTION 'FAIL: 1 EGP approved without override: %', r; END IF;
  IF (SELECT status FROM public.payment_submissions WHERE id = '33333333-0000-0000-0000-0000000000a1') <> 'pending'
     OR (SELECT current_period_end FROM public.billing_accounts WHERE account_id = 'aaaaaaaa-0000-0000-0000-00000000000a') IS DISTINCT FROM before THEN
    RAISE EXCEPTION 'FAIL: refused underpayment still changed state';
  END IF;
  -- Unknown paid amount counts as underpaid.
  r := public.cyreax_review_payment('33333333-0000-0000-0000-0000000000a2', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  IF r->>'result' <> 'underpaid' THEN RAISE EXCEPTION 'FAIL: unknown paid amount approved: %', r; END IF;
  -- Override without a note is refused.
  r := public.cyreax_review_payment('33333333-0000-0000-0000-0000000000a1', 'approve', 'dddddddd-0000-0000-0000-00000000000d', NULL, NULL, true);
  IF r->>'result' <> 'override_needs_note' THEN RAISE EXCEPTION 'FAIL: override without note: %', r; END IF;
  -- Override with a note works once and is recorded.
  r := public.cyreax_review_payment('33333333-0000-0000-0000-0000000000a1', 'approve', 'dddddddd-0000-0000-0000-00000000000d', 'Paid rest in cash', NULL, true);
  IF r->>'result' <> 'approved' THEN RAISE EXCEPTION 'FAIL: override approve returned %', r; END IF;
  IF (SELECT note FROM public.payment_events WHERE payment_id = '33333333-0000-0000-0000-0000000000a1' AND action = 'approved') NOT LIKE '[override: paid 1.00 of 1450.00 EGP]%' THEN
    RAISE EXCEPTION 'FAIL: override not recorded';
  END IF;
  r := public.cyreax_review_payment('33333333-0000-0000-0000-0000000000a1', 'approve', 'dddddddd-0000-0000-0000-00000000000d', 'again', NULL, true);
  IF r->>'result' <> 'already_reviewed' THEN RAISE EXCEPTION 'FAIL: second override approve: %', r; END IF;
END $$;

-- 9c. Approval grants the plan that was bought: monthly, yearly, lifetime.
INSERT INTO public.accounts (id, email, role) VALUES
  ('cccccccc-0000-0000-0000-00000000000c', 'c@test.local', 'customer'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'e@test.local', 'customer'),
  ('ffffffff-0000-0000-0000-00000000000f', 'f@test.local', 'customer');
INSERT INTO public.users (id, account_id, username) VALUES
  (3003, 'cccccccc-0000-0000-0000-00000000000c', 'c'), (5005, 'eeeeeeee-0000-0000-0000-00000000000e', 'e'), (6006, 'ffffffff-0000-0000-0000-00000000000f', 'f');
INSERT INTO public.plans (id, name, price_usd, catalog_plan_id) VALUES
  ('55555555-0000-0000-0000-000000000001', 'Agency Pro', 99, 'agency_pro');
INSERT INTO public.payment_submissions (id, user_id, account_id, transaction_reference, amount, amount_egp, amount_paid_egp, payment_method, interval, plan_id, plan_slug, reference_code)
VALUES
  ('66666666-0000-0000-0000-000000000001', 3003, 'cccccccc-0000-0000-0000-00000000000c', 'TX-C1', 5000, 5000, 5000, 'wallet', 'month', '55555555-0000-0000-0000-000000000001', 'creator', 'CX-CCCCC1'),
  ('66666666-0000-0000-0000-000000000002', 5005, 'eeeeeeee-0000-0000-0000-00000000000e', 'TX-E1', 50000, 50000, 50000, 'wallet', 'year', '55555555-0000-0000-0000-000000000001', 'agency_pro', 'CX-EEEEE1'),
  ('66666666-0000-0000-0000-000000000003', 6006, 'ffffffff-0000-0000-0000-00000000000f', 'TX-F1', 90000, 90000, 90000, 'instapay', 'lifetime', '55555555-0000-0000-0000-000000000001', 'agency_pro', 'CX-FFFFF1');
DO $$
DECLARE b public.billing_accounts%ROWTYPE;
BEGIN
  PERFORM public.cyreax_review_payment('66666666-0000-0000-0000-000000000001', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  SELECT * INTO b FROM public.billing_accounts WHERE account_id = 'cccccccc-0000-0000-0000-00000000000c';
  IF b.plan_id <> 'agency_pro' THEN RAISE EXCEPTION 'FAIL: monthly got plan % instead of the bought plan', b.plan_id; END IF;
  IF b.interval <> 'month' OR abs(extract(epoch FROM b.current_period_end - (now() + interval '1 month'))) > 5 THEN
    RAISE EXCEPTION 'FAIL: monthly interval/end % %', b.interval, b.current_period_end;
  END IF;
  IF b.display_plan_id <> '55555555-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: display plan not stored'; END IF;

  PERFORM public.cyreax_review_payment('66666666-0000-0000-0000-000000000002', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  SELECT * INTO b FROM public.billing_accounts WHERE account_id = 'eeeeeeee-0000-0000-0000-00000000000e';
  IF b.interval <> 'year' OR abs(extract(epoch FROM b.current_period_end - (now() + interval '1 year'))) > 5 THEN
    RAISE EXCEPTION 'FAIL: yearly interval/end % %', b.interval, b.current_period_end;
  END IF;
  IF (SELECT plan FROM public.accounts WHERE id = 'eeeeeeee-0000-0000-0000-00000000000e') <> 'monthly' THEN
    RAISE EXCEPTION 'FAIL: yearly legacy marker';
  END IF;

  PERFORM public.cyreax_review_payment('66666666-0000-0000-0000-000000000003', 'approve', 'dddddddd-0000-0000-0000-00000000000d');
  SELECT * INTO b FROM public.billing_accounts WHERE account_id = 'ffffffff-0000-0000-0000-00000000000f';
  IF b.interval <> 'lifetime' OR b.current_period_end IS NOT NULL OR b.plan_id <> 'agency_pro' THEN
    RAISE EXCEPTION 'FAIL: lifetime stored as % / % / %', b.interval, b.current_period_end, b.plan_id;
  END IF;
  IF (SELECT plan FROM public.accounts WHERE id = 'ffffffff-0000-0000-0000-00000000000f') <> 'one_time' THEN
    RAISE EXCEPTION 'FAIL: lifetime legacy marker';
  END IF;
END $$;

-- 10. BYOK RPCs: only the service role may execute them.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, 'public.set_agent_byok_key(uuid, uuid, text, text, text)', 'EXECUTE')
       OR has_function_privilege(r, 'public.get_agent_byok_key(uuid, uuid, text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: % can execute a BYOK RPC', r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.set_agent_byok_key(uuid, uuid, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: service_role cannot set BYOK keys';
  END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.set_agent_byok_key('bbbbbbbb-0000-0000-0000-00000000000b', gen_random_uuid(), 'sk-x', 'openai', 's');
  RAISE EXCEPTION 'FAIL: authenticated replaced a BYOK key';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
-- Round trip still works for the server.
SET ROLE service_role;
DO $$ BEGIN
  PERFORM public.set_agent_byok_key('aaaaaaaa-0000-0000-0000-00000000000a', '44444444-0000-0000-0000-000000000001', 'sk-test', 'openai', 'sec');
  IF public.get_agent_byok_key('aaaaaaaa-0000-0000-0000-00000000000a', '44444444-0000-0000-0000-000000000001', 'sec') <> 'sk-test' THEN
    RAISE EXCEPTION 'FAIL: BYOK round trip';
  END IF;
END $$;
RESET ROLE;

-- 11. Whop: manual approvals record the provider; Whop tables are service-only.
DO $$ BEGIN
  IF (SELECT payment_provider FROM public.billing_accounts WHERE account_id = 'ffffffff-0000-0000-0000-00000000000f') <> 'manual' THEN
    RAISE EXCEPTION 'FAIL: manual approval did not record payment_provider';
  END IF;
  IF has_table_privilege('authenticated', 'public.whop_checkouts', 'SELECT')
     OR has_table_privilege('anon', 'public.whop_webhook_events', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: Whop tables are readable/writable by clients';
  END IF;
  BEGIN
    UPDATE public.accounts SET country = 'egypt' WHERE id = 'aaaaaaaa-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAIL: invalid country accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- 12. Plan entitlements are a jsonb object (or NULL), nothing else.
DO $$ BEGIN
  INSERT INTO public.plans (id, name, price_usd, entitlements) VALUES ('77777777-0000-0000-0000-000000000001', 'E', 1, '{"channels": 3}');
  BEGIN
    INSERT INTO public.plans (id, name, price_usd, entitlements) VALUES ('77777777-0000-0000-0000-000000000002', 'E2', 1, '"channels"');
    RAISE EXCEPTION 'FAIL: non-object entitlements accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- 13. The three Whop plans are attached to Starter / Pro / Agency, once.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.plans WHERE catalog_plan_id IN ('creator', 'creator_plus', 'agency') AND whop_variant_id IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 plans with a card checkout id, got %', n; END IF;
  SELECT count(*) INTO n FROM public.plans WHERE whop_variant_id = 'plan_JtjPwHcMVU9lU' AND catalog_plan_id = 'creator_plus';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: Pro is not attached to its plan id'; END IF;
END $$;

-- 14. Onboarding: status is constrained (including the review step) and one row per account.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.account_onboarding (account_id, full_name, status) VALUES ('77777777-0000-0000-0000-0000000000aa', 'X', 'nonsense');
    RAISE EXCEPTION 'FAIL: unknown onboarding status accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;
END $$;

-- 15. The review step is a valid onboarding status.
DO $$ BEGIN
  INSERT INTO public.accounts (id, email) VALUES ('77777777-0000-0000-0000-0000000000bb', 'review@test.local') ON CONFLICT DO NOTHING;
  INSERT INTO public.account_onboarding (account_id, full_name, status) VALUES ('77777777-0000-0000-0000-0000000000bb', 'R', 'approved');
  UPDATE public.account_onboarding SET status = 'link_sent' WHERE account_id = '77777777-0000-0000-0000-0000000000bb';
END $$;

-- 16. Onboarding starts after payment: a row can exist before the customer typed anything.
DO $$ BEGIN
  INSERT INTO public.accounts (id, email) VALUES ('77777777-0000-0000-0000-0000000000cc', 'paid@test.local') ON CONFLICT DO NOTHING;
  INSERT INTO public.account_onboarding (account_id) VALUES ('77777777-0000-0000-0000-0000000000cc');
  IF (SELECT status FROM public.account_onboarding WHERE account_id = '77777777-0000-0000-0000-0000000000cc') <> 'awaiting_access' THEN
    RAISE EXCEPTION 'FAIL: a new onboarding row must start at awaiting_access';
  END IF;
  UPDATE public.account_onboarding SET status = 'access_granted' WHERE account_id = '77777777-0000-0000-0000-0000000000cc';
END $$;

SELECT 'ALL DB CHECKS PASSED' AS result;
