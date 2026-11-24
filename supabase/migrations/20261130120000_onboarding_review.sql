-- Onboarding review: a customer who sent their details waits for the admin to
-- approve them ("submitted"), then uses the app and connects channels
-- ("approved"), then receives the activation invitation ("link_sent") and
-- finally is "connected".
--
-- Idempotent. Rollback (put approved rows back to submitted first):
--   UPDATE public.account_onboarding SET status = 'submitted' WHERE status = 'approved';
--   ALTER TABLE public.account_onboarding DROP CONSTRAINT IF EXISTS account_onboarding_status_check;
--   ALTER TABLE public.account_onboarding ADD CONSTRAINT account_onboarding_status_check
--     CHECK (status IN ('submitted', 'link_sent', 'connected'));
--   ALTER TABLE public.account_onboarding DROP COLUMN IF EXISTS approved_at;

ALTER TABLE public.account_onboarding DROP CONSTRAINT IF EXISTS account_onboarding_status_check;
ALTER TABLE public.account_onboarding
  ADD CONSTRAINT account_onboarding_status_check CHECK (status IN ('submitted', 'approved', 'link_sent', 'connected'));
ALTER TABLE public.account_onboarding ADD COLUMN IF NOT EXISTS approved_at timestamptz;
