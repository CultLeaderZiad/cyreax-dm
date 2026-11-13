# Database migrations

These files are **not** applied automatically. There is no Supabase CLI
pipeline in this repo. Run them yourself in the Supabase SQL editor
(Dashboard → SQL → New query), against the project Helixa uses.

Run order is the filename timestamp. Phase 2 stacks on phase 1. Run:

1. `20260930_phase1_rls_realtime.sql`
2. `20260930_phase2_workspaces_and_events.sql`

Phase 2 adds workspaces (owner, admin, member, client-viewer), tags existing
accounts onto a default workspace, and adds the `inbound_events` queue the
webhook worker drains. It does not delete rows. A person who belongs to more
than one agency gets a membership per workspace and can switch; the app no
longer opens the oldest seat automatically.

That script:

1. Enables row-level security on the core tables and adds per-owner policies.
   A logged-in user can read their own rows. An accepted team member
   (`agency_team_members.status = 'active'`) can read the agency's rows.
   Admins (`accounts.role = 'admin'`) can read them too. Everyone else,
   including the public anon key, is denied.
2. Removes `users`, `platform_connections`, `oauth_sessions`,
   `account_agent_settings`, and `dm_queue` from the `supabase_realtime`
   publication. Those tables hold access tokens or encrypted keys. Realtime
   payloads include every column, so they must not be broadcast.
3. Revokes `SELECT` on `users.access_token`,
   `platform_connections.access_token`, and the BYOK key column from the
   `anon` and `authenticated` roles.
4. Adds `users.reconnect_required` and `users.token_refreshed_at` for the
   Instagram token refresh job.

The Next.js server uses the service-role key, which bypasses RLS. Webhooks
and API routes keep working. Do not run this from an app process, and do not
run it against a database you have not backed up.

After it succeeds:

- Supabase → Database → Advisors. Confirm RLS is on for `users`, `messages`,
  `conversations`, `automations`, and `platform_connections`.
- Delete any hand-written policy that uses `USING (true)` on those tables.
  This script does not drop unknown policies, and permissive policies are
  combined with OR.
- Do **not** re-run `scripts/99-fix-realtime.sql`. That script adds `users`
  back to the realtime publication.

The older files in this folder and the scripts in `scripts/` were applied by
hand before this README existed. They are not a complete history of the live
schema.

## Phase 2 manual steps

Run `20260930_phase2_workspaces_and_events.sql` after the phase 1 file. It is
idempotent. It does not delete tenant rows.

Environment:

- `CRON_SECRET` must be set. Vercel Cron sends it as a bearer token. The new
  drain route fails closed without it, same as the other cron routes.
- Optional: `INBOUND_RATE_LIMIT` (default 30) and `INBOUND_RATE_WINDOW_MS`
  (default 60000). That is the per-account cap on events a worker will
  process inside one window. Over the cap, the event stays pending and is
  tried again after the window. It does not count as a failure.

Cron:

- `vercel.json` schedules `GET /api/cron/process-inbound-events` every minute.
  Vercel Hobby only allows daily crons, so this schedule needs Pro (or an
  external cron calling that path with `Authorization: Bearer $CRON_SECRET`).
- Webhooks also call the drain after the response via Next.js `after()`, so
  a delivery is processed without waiting for the minute tick. The cron is
  what retries failures and rate-limit defers.
- If `inbound_events` does not exist yet, the webhook processes that delivery
  in the request and still returns 200. Run the SQL before relying on retries.

Queue choice: a Supabase table, not a new vendor. The app is already on
Vercel plus Supabase, and there is no Redis or queue product in the project.
`inbound_events.idempotency_key` is unique, `claim_inbound_events` uses
`FOR UPDATE SKIP LOCKED`, and failed rows wait on exponential backoff
(15s, 30s, 60s, … capped at 15 minutes) until 5 attempts, then `dead`.

After it succeeds, confirm in the SQL editor:

```sql
select count(*) from public.workspaces;
select count(*) from public.workspace_members where role = 'owner';
select indexname from pg_indexes where tablename = 'inbound_events';
```

The owner count should match the number of accounts that existed before the
script. `inbound_events` should have a unique index on `idempotency_key`.

## Phase 3 manual steps

Run `20260930_phase3_contacts_and_clicks.sql` after phase 2. It is idempotent.
It does not delete rows. It was not run against a live database from this change.

The script:

1. Adds `messages.direction` (`in` or `out`) and backfills it. A message whose
   sender is the conversation's recipient is inbound. That corrects Messenger
   and Telegram rows that were stored with `is_from_instagram = false` for
   both directions.
2. Creates `contacts` (one person per channel in a workspace): tags, custom
   fields, source, first/last seen, `last_inbound_at`, and `bot_paused`.
3. Creates `tracked_links`. `GET /r/{code}` redirects to the stored https URL
   and inserts `automation_events.event_type = 'link_click'`.
4. Enables row-level security on both new tables. The service role used by
   the app bypasses it. Authenticated users can read their workspace's rows.
   They cannot insert from the browser.

`NEXT_PUBLIC_APP_URL` must be the public origin. Outbound button and text
links are rewritten to `{origin}/r/{code}` only when that variable is set.
Without it, messages still send the original URL and link clicks stay at
zero.

The 24-hour window is computed from `contacts.last_inbound_at`, then from the
latest inbound message if the contact row does not exist yet. Instagram and
Messenger sends outside 24 hours and inside 7 days go out with Meta's
`HUMAN_AGENT` tag and the inbox shows that. WhatsApp sends outside 24 hours
are blocked (template messages are not in this phase). Telegram has no window.

Confirm after it succeeds:

```sql
select column_name from information_schema.columns
 where table_name = 'messages' and column_name = 'direction';
select count(*) from public.contacts;
select indexname from pg_indexes where tablename = 'tracked_links';
```

## Phase 4 manual steps

Run `20260930_phase4_channels.sql` after phase 3. It is idempotent. It does
not delete rows. It was not run against a live database from this change.

The script:

1. Adds `conversations.channel_account_id` and `conversations.external_thread_id`
   so a manual reply uses the WhatsApp number, TikTok account, or widget that
   received the thread. Replaces `UNIQUE (user_id, recipient_id)` with a
   unique index that includes platform and channel account. If duplicate
   threads already exist, that index is skipped and a notice is raised.
2. Adds `platform_connections.refresh_token` and `token_expires_at`, and
   revokes `SELECT` on `refresh_token` from `anon` and `authenticated`.
3. Allows `tiktok` and `webchat` on `platform_connections.platform` and
   `inbound_events.platform`.
4. Creates `whatsapp_templates`, `webchat_widgets`, `webchat_visitors`, and
   `webchat_rate_buckets`. Authenticated users can read their own widgets and
   templates. Visitor secret hashes and rate buckets have no read policy.

Meta, for WhatsApp:

- Add the WhatsApp product to the same Meta app Helixa already uses.
- Create an Embedded Signup configuration and set
  `NEXT_PUBLIC_WHATSAPP_CONFIG_ID` to its id. Without that id, the dashboard
  still connects a number with a phone number id and a system-user token.
  The number must already be registered in WhatsApp Manager. This app does
  not call `/{phone-number-id}/register`.
- System-user token scopes: `whatsapp_business_messaging` and
  `whatsapp_business_management`.
- Webhook callback `{APP_URL}/api/whatsapp/webhook`, verify token
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, subscribed field `messages`.
- App id and secret: `FACEBOOK_APP_ID` or `NEXT_PUBLIC_FACEBOOK_APP_ID` or
  `INSTAGRAM_APP_ID`, and `META_APP_SECRET` or `FACEBOOK_APP_SECRET` or
  `INSTAGRAM_APP_SECRET`.

TikTok, after approval (see `docs/phase4-channels.md`):

- `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`
- `TIKTOK_REDIRECT_URI` defaults to `{NEXT_PUBLIC_APP_URL}/api/tiktok/callback`
- `TIKTOK_MESSAGING_ENABLED=true` only after Business Messaging approval
- `TIKTOK_COMMENT_TO_DM_ENABLED=true` only where Comment-to-Message is available
- Webhook `{APP_URL}/api/tiktok/webhook` is subscribed on connect
- `CRON_SECRET` for `GET /api/cron/refresh-tiktok-tokens` (hourly)

Website chat needs `NEXT_PUBLIC_APP_URL` so the copied snippet points at this
app. An empty allowed-domain list denies every site.

Confirm after it succeeds:

```sql
select column_name from information_schema.columns
 where table_name = 'conversations' and column_name = 'channel_account_id';
select conname from pg_constraint
 where conname in ('inbound_events_platform_check', 'platform_connections_platform_check');
select count(*) from public.webchat_widgets;
```

## Phase 5 manual steps

Run `20260930_phase5_flows_broadcasts.sql` after phase 4. It is idempotent.
It does not delete rows. It was not run against a live database from this
change. Do not run it from the app.

The script:

1. Adds `contacts.opted_in`, `contacts.opted_out`, and `contacts.is_follower`.
   Existing contacts stay opted out of broadcasts until something sets
   `opted_in`. Flow replies inside an open window do not require that flag.
2. Adds `tracked_links.broadcast_id` so `/r/{code}` can mark a broadcast click.
   If the column is missing, link tracking still redirects and skips the
   broadcast update.
3. Creates `flows`, `flow_versions`, `flow_runs`, `flow_jobs`,
   `flow_node_stats`, `broadcasts`, `broadcast_recipients`, `sequences`,
   `sequence_enrollments`, `bio_pages`, `ref_links`, `giveaways`, and
   `giveaway_entries`.
4. Adds `claim_flow_jobs` and `bump_flow_node_stat`, executable by
   `service_role` only.
5. Enables row-level security. Authenticated users can read their workspace's
   rows. `flow_jobs` has no read policy. The service role bypasses RLS.

The existing cron `GET /api/cron/process-inbound-events` also drains
`flow_jobs` (delays, button resumes, broadcasts, sequence steps). No new cron
path is required. `CRON_SECRET` stays required.

`NEXT_PUBLIC_APP_URL` is the origin for `/b/{slug}`, ref-link QR targets that
point back at Helixa, and tracked broadcast links. Without it, public pages
still work at whatever host is serving the app, and outbound links stay
untracked.

`TIKTOK_MESSAGING_ENABLED=true` is still required before a TikTok DM trigger
matches. Leave it unset until Business Messaging is approved.

WhatsApp templates still sync the way phase 4 documents. A broadcast or a
flow step outside 24 hours sends only a template whose row is `approved`,
and only to a contact with `opted_in = true`.

After the SQL succeeds, open Flows and use Import automations. That publishes
each active single-step rule as a live flow. Until that import, the old
automations keep sending. After it, the live flow replaces that send so the
contact does not get two replies.

Confirm after it succeeds:

```sql
select column_name from information_schema.columns
 where table_name = 'contacts' and column_name in ('opted_in', 'opted_out', 'is_follower');
select proname from pg_proc where proname in ('claim_flow_jobs', 'bump_flow_node_stat');
select count(*) from public.flows;
```

## Phase 6

Run `20260930_phase6_differentiators.sql` after phase 5. Enable the `vector`
extension in the Supabase dashboard first if `CREATE EXTENSION` is restricted.
The file adds the Arabic agent tables (`ai_agent_settings`, `knowledge_sources`,
`knowledge_chunks`, `ai_answer_logs`), agency branding and client reports,
the product catalog and orders, and outgoing webhook deliveries. It does not
delete rows. Details and the Vercel custom-domain steps are in
`docs/phase6-differentiators.md`.

The inbound cron also drains `outgoing_webhook_deliveries`. Client reports use
a separate daily cron, `GET /api/cron/client-reports`.

## Phase 7

Run `20260930_phase7_launch.sql` after phase 6. It adds plan billing, usage
meters, agency client prices and invoices, Meta deletion receipts, and
`bot_locale` on `users` and `accounts`. It does not delete rows.
`increment_usage` is executable by `service_role` only.
`data_deletion_requests` is revoked from `anon` and `authenticated`.

The new cron is `GET /api/cron/dunning` at 04:00 UTC. Full setup, including
every environment variable and the Meta callback URLs, is in `docs/DEPLOY.md`.

`20260930_phase7_tiktok_windows.sql` adds `tiktok_dm_windows` for the TikTok
48-hour, 10-message cap. Run it after phase 7. It was not applied to a live
database. Missing the table does not stop webhooks; the cap is still counted
in the running process until restart.

## Scheduler (pg_cron)

`20261113120000_pg_cron_scheduler.sql` makes Supabase call the cron routes
itself: the inbound queue, flow delays and outgoing webhooks every minute,
campaigns every 5 minutes, and Meta token health every 6 hours. GitHub
Actions schedules can run many minutes late and pause after 60 days without
repo activity. After running it, store two Vault secrets as the file header
shows (the site URL, and the same `CRON_SECRET` as Vercel). Until both exist,
the jobs do nothing. The rollback is in the file header. Check that it works with
`select * from cron.job_run_details order by start_time desc limit 10;` and
`GET /api/health` (`checks.queue` should be `ok`).
