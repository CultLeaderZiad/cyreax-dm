-- BYOK key RPCs, brought into the migration chain (they only existed in
-- scripts/33-schema-byok-rpc.sql) and locked down.
--
-- Before: both were SECURITY DEFINER with the default EXECUTE grant to
-- PUBLIC, so any signed-in (or anon) client could call
-- set_agent_byok_key for another account and overwrite its key, as long as
-- it knew the encryption secret, and get_agent_byok_key could be probed.
-- After: only the service role (server code) can execute them, and
-- search_path is pinned so a SECURITY DEFINER body cannot be hijacked.
-- Bodies are unchanged.
--
-- Additive. ROLLBACK (restores the previous, open grants):
--   GRANT EXECUTE ON FUNCTION public.set_agent_byok_key(uuid, uuid, text, text, text) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.get_agent_byok_key(uuid, uuid, text) TO PUBLIC;
--   ALTER FUNCTION public.set_agent_byok_key(uuid, uuid, text, text, text) RESET search_path;
--   ALTER FUNCTION public.get_agent_byok_key(uuid, uuid, text) RESET search_path;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.set_agent_byok_key(
  p_account_id UUID,
  p_agent_id UUID,
  p_api_key TEXT,
  p_provider TEXT,
  p_secret TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.account_agent_settings (account_id, agent_id, byok_key_encrypted, byok_provider, byok_connected_at)
  VALUES (
    p_account_id,
    p_agent_id,
    pgp_sym_encrypt(p_api_key, p_secret),
    p_provider,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (account_id, agent_id) DO UPDATE SET
    byok_key_encrypted = pgp_sym_encrypt(p_api_key, p_secret),
    byok_provider = EXCLUDED.byok_provider,
    byok_connected_at = CURRENT_TIMESTAMP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_byok_key(
  p_account_id UUID,
  p_agent_id UUID,
  p_secret TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_decrypted TEXT;
BEGIN
  SELECT pgp_sym_decrypt(byok_key_encrypted::bytea, p_secret)
  INTO v_decrypted
  FROM public.account_agent_settings
  WHERE account_id = p_account_id AND agent_id = p_agent_id;

  RETURN v_decrypted;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_agent_byok_key(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_agent_byok_key(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_byok_key(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_byok_key(uuid, uuid, text) TO service_role;

COMMIT;
