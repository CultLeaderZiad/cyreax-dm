-- Support tickets between customers and the platform admin.
-- All writes go through the server (service role); customers can only read
-- their own tickets and messages through RLS.
--
-- Additive. ROLLBACK:
--   DROP TABLE IF EXISTS public.support_messages;
--   DROP TABLE IF EXISTS public.support_tickets;

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  workspace_id uuid,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 160),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('payment', 'bug', 'account', 'other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_customer', 'resolved', 'closed')),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_account_idx ON public.support_tickets (account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_account_id uuid,
  author_role text NOT NULL CHECK (author_role IN ('customer', 'admin')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON public.support_messages (ticket_id, created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.support_tickets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.support_messages FROM anon, authenticated;
REVOKE ALL ON public.support_tickets FROM anon;
REVOKE ALL ON public.support_messages FROM anon;
GRANT SELECT ON public.support_tickets, public.support_messages TO authenticated;

DROP POLICY IF EXISTS cyreax_support_tickets_own ON public.support_tickets;
CREATE POLICY cyreax_support_tickets_own ON public.support_tickets
  FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.helixa_is_admin());

DROP POLICY IF EXISTS cyreax_support_messages_own ON public.support_messages;
CREATE POLICY cyreax_support_messages_own ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.account_id = auth.uid())
    OR public.helixa_is_admin()
  );

COMMIT;
