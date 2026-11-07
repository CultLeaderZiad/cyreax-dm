-- Security: close RLS gaps the repository's SQL never covered, and remove
-- legacy public write policies on the `media` storage bucket.
--
-- Context: the app reads/writes these tables only with the service-role key
-- (which bypasses RLS). The public anon key ships in the browser bundle, so a
-- table in `public` with RLS off and Supabase's default grants is readable and
-- writable by anyone through PostgREST.
--
--   admin_audit_log   (scripts/04)  - admin actions; admin dashboard listens via realtime
--   manual_payments   (scripts/31)  - client name, phone number, amount (Vodafone Cash)
--   payment_methods   (scripts/16)  - payout phone number / instructions
--   plans             (scripts/16)  - pricing; anon could UPDATE prices
--   sessions          (scripts/02)  - legacy opaque session tokens
--
-- Storage: scripts/05 and scripts/08 created policies letting the `public`
-- role INSERT/UPDATE/DELETE any object in the `media` bucket. scripts/25 only
-- dropped "Public Access". No app code uses Supabase Storage directly; public
-- bucket URLs keep working without a SELECT policy.
--
-- Additive (enables RLS / adds narrow SELECT policies / drops only the named
-- legacy permissive storage policies). Idempotent.
--
-- ROLLBACK:
--   ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;  -- per table above
--   DROP POLICY IF EXISTS cyreax_admin_audit_log_admin_select ON public.admin_audit_log;
--   DROP POLICY IF EXISTS cyreax_manual_payments_owner_select ON public.manual_payments;
--   -- storage (re-opens anonymous writes; avoid):
--   CREATE POLICY "Public Access" ON storage.objects FOR ALL TO public
--     USING (bucket_id = 'media') WITH CHECK (bucket_id = 'media');

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['admin_audit_log', 'manual_payments', 'payment_methods', 'plans', 'sessions'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.sessions FROM anon, authenticated';
  END IF;

  IF to_regclass('public.admin_audit_log') IS NOT NULL
     AND to_regprocedure('public.helixa_is_admin()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS cyreax_admin_audit_log_admin_select ON public.admin_audit_log';
    EXECUTE 'CREATE POLICY cyreax_admin_audit_log_admin_select ON public.admin_audit_log
               FOR SELECT TO authenticated USING (public.helixa_is_admin())';
  END IF;

  IF to_regclass('public.manual_payments') IS NOT NULL
     AND to_regprocedure('public.helixa_owns_profile(bigint)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS cyreax_manual_payments_owner_select ON public.manual_payments';
    EXECUTE 'CREATE POLICY cyreax_manual_payments_owner_select ON public.manual_payments
               FOR SELECT TO authenticated
               USING (public.helixa_owns_profile(user_id) OR public.helixa_is_admin())';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public Access" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Media Public Uploads" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Media Public Update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Media Public Deletion" ON storage.objects';
  END IF;
END $$;

COMMIT;

-- Verify afterwards:
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;
--   -- expect no rows
--   SELECT policyname, roles, cmd FROM pg_policies WHERE schemaname = 'storage';
