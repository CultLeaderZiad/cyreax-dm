-- ============================================================================
-- Migration: 20261028_revenue_funnel_indexes.sql
-- Description: Indexes and RLS policies for fast, secure revenue & funnel analytics.
-- Idempotent: Can be safely re-run without errors.
-- ============================================================================

-- Fast lookup of paid orders by user and created_at range
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
  ON public.orders (user_id, status, created_at DESC);

-- Fast lookup of paid orders by workspace and created_at range
CREATE INDEX IF NOT EXISTS idx_orders_workspace_status_created
  ON public.orders (workspace_id, status, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Fast lookup of comments in automation events
CREATE INDEX IF NOT EXISTS idx_automation_events_user_event_created
  ON public.automation_events (user_id, event_type, created_at DESC);

-- Fast lookup of qualified contacts by email/phone
CREATE INDEX IF NOT EXISTS idx_contacts_user_lead_created
  ON public.contacts (user_id, created_at DESC)
  WHERE email IS NOT NULL OR phone IS NOT NULL;

-- Ensure RLS is active on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS policy for workspace members / owners to read their orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'helixa_orders_workspace_select'
  ) THEN
    CREATE POLICY helixa_orders_workspace_select ON public.orders
      FOR SELECT TO authenticated
      USING (
        public.helixa_owns_profile(user_id)
        OR (workspace_id IS NOT NULL AND public.helixa_can_access_workspace(workspace_id, 'viewer'))
        OR public.helixa_is_admin()
      );
  END IF;
END $$;
