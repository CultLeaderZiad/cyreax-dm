import fs from "fs"
import path from "path"

const files = [
  "20260910_57_platform_content_sentiment.sql",
  "20260930_phase3_contacts_and_clicks.sql",
  "20260930_phase4_channels.sql",
  "20260930_phase5_flows_broadcasts.sql",
  "20260930_phase6_differentiators.sql",
  "20260930_phase7_launch.sql",
  "20260930_phase7_tiktok_windows.sql",
  "20261002120000_payment_ledger.sql"
]

let remaining = `-- ========================================================
-- HELIXA / CYREAX DM: REMAINING MIGRATIONS (Phases 3 to 7)
-- (Phase 1 & 2 workspaces have already succeeded in your database)
-- ========================================================

-- Global Extensions and Column Prerequisites
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE IF EXISTS public.conversations ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'instagram';
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON public.conversations(platform);

ALTER TABLE IF EXISTS public.messages ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'instagram';
CREATE INDEX IF NOT EXISTS idx_messages_platform ON public.messages(platform);

-- Ensure platform_content and comment_sentiment have required columns
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS public.platform_content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS external_post_id TEXT;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS comment_id TEXT;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS confidence NUMERIC(4, 2) DEFAULT 1.0;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS raw_analysis JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.comment_sentiment ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
`

for (const file of files) {
  const filePath = path.join("supabase", "migrations", file)
  if (fs.existsSync(filePath)) {
    remaining += `\n\n-- --------------------------------------------------------\n`
    remaining += `-- START OF FILE: ${file}\n`
    remaining += `-- --------------------------------------------------------\n\n`
    let content = fs.readFileSync(filePath, "utf8")
    content = content.replace(/^BEGIN;\s*$/gm, "-- BEGIN;")
    content = content.replace(/^COMMIT;\s*$/gm, "-- COMMIT;")
    remaining += content
    remaining += "\n"
  } else {
    console.error("Missing file:", file)
  }
}

fs.writeFileSync(path.join("supabase", "remaining_migration.sql"), remaining)
console.log(`Generated supabase/remaining_migration.sql with ${remaining.split("\n").length} lines.`)
