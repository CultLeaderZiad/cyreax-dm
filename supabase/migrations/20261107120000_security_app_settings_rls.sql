-- Security: stop exposing secret app_settings rows to the public anon key.
--
-- scripts/34-schema-app-settings.sql created
--   "Public read access for app_settings" FOR SELECT TO authenticated, anon USING (true)
-- app_settings also holds `smtp_settings` (SMTP host/user/password), so anyone
-- holding the public anon key could read it through PostgREST:
--   GET /rest/v1/app_settings?key=eq.smtp_settings
-- The app reads app_settings with the service-role key only, except
-- /api/settings/updates GET, which reads `updates_page` through the SSR client.
--
-- Additive and idempotent. Does not touch rows.
--
-- ROLLBACK (restores the previous, unsafe behaviour; only if something breaks):
--   DROP POLICY IF EXISTS cyreax_app_settings_public_read ON public.app_settings;
--   CREATE POLICY "Public read access for app_settings" ON public.app_settings
--     FOR SELECT TO authenticated, anon USING (true);

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Public read access for app_settings" ON public.app_settings';
  EXECUTE 'DROP POLICY IF EXISTS cyreax_app_settings_public_read ON public.app_settings';
  EXECUTE $p$
    CREATE POLICY cyreax_app_settings_public_read ON public.app_settings
      AS PERMISSIVE FOR SELECT TO anon, authenticated
      USING (key IN ('update_banner', 'updates_page'))
  $p$;
  -- Writes only ever come from the service role.
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.app_settings FROM anon, authenticated';
END $$;

COMMIT;

-- After running, verify (expect only cyreax_app_settings_public_read and the
-- service_role policy):
--   SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'app_settings';
-- Any other permissive SELECT policy on app_settings re-opens the leak (policies OR together).
