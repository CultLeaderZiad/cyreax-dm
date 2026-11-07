-- Minimal stand-in for a Supabase project, enough to run this repo's
-- security/payment migrations on plain Postgres in tests and CI.
-- Pre-existing tables follow scripts/12, 14, 16, 17, 34, 36 and the phase
-- migrations they come from. Not a full schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
-- Supabase's "Public Access" style policy from scripts/08, to prove it is dropped.
CREATE POLICY "Public Access" ON storage.objects FOR ALL TO public USING (bucket_id = 'media') WITH CHECK (bucket_id = 'media');

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY, email text, role text NOT NULL DEFAULT 'customer',
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'monthly', 'one_time', 'expired')),
  trial_ends_at timestamptz, updated_at timestamptz
);
CREATE TABLE public.users (
  id bigint PRIMARY KEY, account_id uuid, username text, plan text, trial_ends_at timestamptz, updated_at timestamptz
);
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, price_usd numeric(10,2) NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly', is_active boolean NOT NULL DEFAULT true, price_yearly numeric(10,2)
);
CREATE TABLE public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_reference text NOT NULL, note text, amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by bigint, reviewed_at timestamptz, rejection_reason text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  plan_id uuid REFERENCES public.plans(id), proof_note text,
  payment_method text DEFAULT 'vodafone_cash' CHECK (payment_method IN ('stripe', 'vodafone_cash'))
);
CREATE TABLE public.billing_accounts (
  account_id uuid PRIMARY KEY, plan_id text NOT NULL, status text NOT NULL DEFAULT 'trialing',
  interval text NOT NULL DEFAULT 'month', provider text, provider_customer_id text, provider_subscription_id text,
  current_period_end timestamptz, trial_ends_at timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
  scheduled_plan_id text, grace_until timestamptz, dunning_step integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.subscriptions (
  user_id bigint PRIMARY KEY, stripe_subscription_id text, plan_type text, status text, current_period_end timestamptz, updated_at timestamptz
);
CREATE TABLE public.app_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz DEFAULT now());
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for app_settings" ON public.app_settings FOR SELECT TO authenticated, anon USING (true);
CREATE TABLE public.manual_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id bigint, phone_number text, amount numeric);
CREATE TABLE public.admin_audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id bigint, action text);
CREATE TABLE public.payment_methods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text, config jsonb);
CREATE TABLE public.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id bigint, session_token text);

-- Supabase's default: anon/authenticated get table privileges in public.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- From supabase/migrations/20260930_phase1_rls_realtime.sql
CREATE OR REPLACE FUNCTION public.helixa_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = auth.uid() AND a.role = 'admin') $$;
CREATE OR REPLACE FUNCTION public.helixa_owns_profile(profile_id bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = profile_id AND u.account_id = auth.uid()) $$;
GRANT EXECUTE ON FUNCTION public.helixa_is_admin(), public.helixa_owns_profile(bigint) TO authenticated;
