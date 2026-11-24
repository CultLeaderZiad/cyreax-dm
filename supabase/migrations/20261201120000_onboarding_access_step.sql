-- Onboarding starts after PAYMENT and a first admin approval:
--   awaiting_access  paid, waiting for the admin to approve access
--   access_granted   approved: the customer now fills in their details
--   submitted        details sent, waiting for the second review
--   approved         details approved: the customer uses the app and connects channels
--   link_sent        activation invitation sent
--   connected        done
--
-- A row now exists before the customer has typed anything, so full_name is
-- optional. Idempotent. Rollback (map the new states back first):
--   UPDATE public.account_onboarding SET status = 'submitted' WHERE status IN ('awaiting_access', 'access_granted');
--   UPDATE public.account_onboarding SET full_name = '' WHERE full_name IS NULL;
--   ALTER TABLE public.account_onboarding ALTER COLUMN full_name SET NOT NULL;
--   ALTER TABLE public.account_onboarding ALTER COLUMN status SET DEFAULT 'submitted';
--   ALTER TABLE public.account_onboarding DROP CONSTRAINT IF EXISTS account_onboarding_status_check;
--   ALTER TABLE public.account_onboarding ADD CONSTRAINT account_onboarding_status_check
--     CHECK (status IN ('submitted', 'approved', 'link_sent', 'connected'));
--   ALTER TABLE public.account_onboarding DROP COLUMN IF EXISTS access_approved_at;

ALTER TABLE public.account_onboarding ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.account_onboarding ALTER COLUMN status SET DEFAULT 'awaiting_access';
ALTER TABLE public.account_onboarding DROP CONSTRAINT IF EXISTS account_onboarding_status_check;
ALTER TABLE public.account_onboarding
  ADD CONSTRAINT account_onboarding_status_check
  CHECK (status IN ('awaiting_access', 'access_granted', 'submitted', 'approved', 'link_sent', 'connected'));
ALTER TABLE public.account_onboarding ADD COLUMN IF NOT EXISTS access_approved_at timestamptz;
