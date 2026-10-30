-- ============================================================================
-- Migration: 20261028_notifications.sql
-- Description: In-app notifications table with RLS and notification preferences.
-- Idempotent: Can be safely re-run without errors.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Notifications table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'handoff',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup of workspace notifications ordered by read status and date
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_read_created
  ON public.notifications (workspace_id, read_at, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Fast lookup of account notifications
CREATE INDEX IF NOT EXISTS idx_notifications_account_created
  ON public.notifications (account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Notification preferences column on accounts & workspaces
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS notification_settings jsonb
  DEFAULT '{"email_alerts": true, "handoff_alerts": true, "lead_alerts": true, "low_balance_alerts": true, "weekly_digest": false}'::jsonb;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS notification_settings jsonb
  DEFAULT '{"email_alerts": true, "handoff_alerts": true, "lead_alerts": true, "low_balance_alerts": true, "weekly_digest": false}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'helixa_notifications_select'
  ) THEN
    CREATE POLICY helixa_notifications_select ON public.notifications
      FOR SELECT TO authenticated
      USING (
        (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
        OR (account_id IS NOT NULL AND account_id = auth.uid())
        OR public.helixa_is_admin()
      );
  END IF;

  -- UPDATE policy (e.g. mark as read)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'helixa_notifications_update'
  ) THEN
    CREATE POLICY helixa_notifications_update ON public.notifications
      FOR UPDATE TO authenticated
      USING (
        (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
        OR (account_id IS NOT NULL AND account_id = auth.uid())
        OR public.helixa_is_admin()
      )
      WITH CHECK (
        (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
        OR (account_id IS NOT NULL AND account_id = auth.uid())
        OR public.helixa_is_admin()
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'helixa_notifications_insert'
  ) THEN
    CREATE POLICY helixa_notifications_insert ON public.notifications
      FOR INSERT TO authenticated
      WITH CHECK (
        (workspace_id IS NOT NULL AND public.helixa_can_read_workspace(workspace_id))
        OR (account_id IS NOT NULL AND account_id = auth.uid())
        OR public.helixa_is_admin()
      );
  END IF;
END $$;
