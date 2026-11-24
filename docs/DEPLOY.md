# Deploy Cyreax DM from zero

Cyreax DM is a Next.js app on Vercel with a Supabase Postgres database. Nothing in this repository applies SQL for you. Run the files below in the Supabase SQL editor, in order, against a backup.

## 1. Create the project

1. Create a Supabase project and a Vercel project from this repo.
2. Copy `.env.example` to `.env.local` for local work. Put the same values in Vercel, except `SEED_*`, which is only for the demo script.
3. Set `NEXT_PUBLIC_APP_URL` to the production origin, with no trailing slash.
4. Generate `BYOK_ENCRYPTION_SECRET` and `CRON_SECRET` with `openssl rand -base64 32`. Keep the encryption secret. Rotating it makes stored tokens unreadable.

## 2. Environment variables

Required for a working app:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes. Never expose it |
| `NEXT_PUBLIC_APP_URL` | OAuth redirects, webhooks, deletion links |
| `BYOK_ENCRYPTION_SECRET` | Token and integration-secret encryption |
| `CRON_SECRET` | Bearer token for `/api/cron/*` |
| `INSTAGRAM_APP_ID` | Instagram token exchange |
| `NEXT_PUBLIC_INSTAGRAM_APP_ID` | Same app id, for the browser |
| `INSTAGRAM_APP_SECRET` | Instagram and Meta signatures |
| `GROQ_API_KEY` | Default AI replies |

Instagram and Facebook:

| Variable | Used for |
| --- | --- |
| `META_APP_SECRET` | Optional alias. Data deletion reads this, then `FACEBOOK_APP_SECRET`, then `INSTAGRAM_APP_SECRET` |
| `NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI` | Defaults to `{APP_URL}/api/instagram/callback` |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | Instagram webhook handshake |
| `NEXT_PUBLIC_FACEBOOK_APP_ID` | Facebook Login. Falls back to the Instagram app id |
| `FACEBOOK_APP_SECRET` | Facebook token exchange and webhooks |
| `NEXT_PUBLIC_FACEBOOK_REDIRECT_URI` | Defaults to `{APP_URL}/api/facebook/callback` |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | Facebook webhook handshake |
| `DISABLE_WEBHOOK_SIGNATURE_CHECK` | Must stay unset in production |

WhatsApp:

| Variable | Used for |
| --- | --- |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | WhatsApp webhook handshake (only this token; no fallback) |
| `NEXT_PUBLIC_WHATSAPP_CONFIG_ID` | Embedded Signup. Without it, paste a phone number id and system-user token |

TikTok. Leave the flags unset until the app is approved. See `docs/phase4-channels.md`.

| Variable | Used for |
| --- | --- |
| `TIKTOK_APP_ID` | Client key |
| `TIKTOK_APP_SECRET` | Client secret |
| `TIKTOK_REDIRECT_URI` | Defaults to `{APP_URL}/api/tiktok/callback` |
| `TIKTOK_MESSAGING_ENABLED` | Must be the string `true` after the access forms below |
| `TIKTOK_COMMENT_TO_DM_ENABLED` | `false` kills Comment-to-Message. `true` only matters when the account region is not stored |
| `TIKTOK_US_REVIEW_APPROVED` | Must be `true` before a US Business Account can send DMs |

AI providers, all optional except Groq for the default agent:

`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, plus optional model overrides `GROQ_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`, `OPENROUTER_MODEL`, `OPENAI_MODEL`. `OPENAI_API_KEY` also switches knowledge-base embeddings to `text-embedding-3-small`. Re-save the knowledge base if you add or remove it.

Cyreax DM's own subscription (card via Whop for everyone, e-wallet / InstaPay for Egypt; see section 7):

| Variable | Used for |
| --- | --- |
| `PAYMENT_WALLET_NUMBER` | Required. E-wallet number customers send to (`01XXXXXXXXX` or `+20…`). Missing or invalid hides the method ("payment temporarily unavailable"); there is no built-in default |
| `PAYMENT_INSTAPAY_NUMBER` | Required. InstaPay mobile number, same rules |
| `PAYMENT_EGP_PER_USD` | Optional. Only for plans with no EGP price in Admin → Plans: amount = USD price × rate, rounded up. Unset means such plans cannot be bought |
| `CRON_SECRET` | Required. Bearer token the scheduler sends to `/api/cron/*` (dunning ends expired plans; see section 4) |
| `WHOP_API_KEY` | Required for card payments. Whop Account API key, server-side only |
| `WHOP_WEBHOOK_SECRET` | Required for card payments. The `ws_…` signing secret of the `/api/webhooks/whop` webhook |
| `WHOP_ACCOUNT_ID` | Optional. Your Whop account id (`biz_…`) |
| `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID` | Optional platform Paymob checkout (`/api/billing/checkout`) |
| `TAP_SECRET_KEY` | Optional platform Tap checkout, and the Tap webhook when a workspace has no Tap key |

Stripe is not used for Cyreax DM's own billing (it was removed). Agencies can still connect their own Stripe account for client invoices and DM commerce under Integrations.

DM commerce and agency client invoices do **not** read those platform secrets. The agency saves its own Paymob, Tap or Stripe keys under Integrations, encrypted with `BYOK_ENCRYPTION_SECRET`.

Other:

| Variable | Used for |
| --- | --- |
| `IPQS_API_KEY` | Optional fraud check on Instagram connect |
| `INBOUND_RATE_LIMIT` | Default 30 events per window |
| `INBOUND_RATE_WINDOW_MS` | Default 60000 |
| `SENTRY_DSN` | Server error envelopes. No SDK |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser error boundary |
| `SEED_ACCOUNT_EMAIL` | Demo seed only |
| `SEED_KEEP_PLAN` | Set to `1` to leave `accounts.plan` alone |

SMTP is not an environment variable. An admin saves it in `app_settings` under the key `smtp_settings`.

## 3. Migration order

Older files, if this database is empty and you are replaying history:

1. `supabase/migrations/20260813_toggle_pricing.sql`
2. `supabase/migrations/20260817_multi_platform_schema.sql`
3. `supabase/migrations/20260910_57_platform_content_sentiment.sql`

Phase files, in this order. Each is idempotent and does not delete tenant rows.

4. `supabase/migrations/20260930_phase1_rls_realtime.sql`
5. `supabase/migrations/20260930_phase2_workspaces_and_events.sql`
6. `supabase/migrations/20260930_phase3_contacts_and_clicks.sql`
7. `supabase/migrations/20260930_phase4_channels.sql`
8. `supabase/migrations/20260930_phase5_flows_broadcasts.sql`
9. `supabase/migrations/20260930_phase6_differentiators.sql` — enable the `vector` extension first if `CREATE EXTENSION` is restricted
10. `supabase/migrations/20260930_phase7_launch.sql`
11. `supabase/migrations/20260930_phase7_tiktok_windows.sql`
12. `supabase/migrations/20261002120000_payment_ledger.sql`
13. `supabase/migrations/20261028_notifications.sql`, then `20261028_revenue_funnel_indexes.sql`
14. Security and payments (2026-11-07): `20261107120000_security_app_settings_rls.sql`, `20261107120100_security_rls_gaps_and_storage.sql`, `20261107120200_outbound_sends.sql`, `20261107120300_manual_wallet_payments.sql`, `20261107120400_support_tickets.sql`
15. Scheduler and campaigns (2026-11-13): `20261113120000_pg_cron_scheduler.sql`, `20261113120100_email_campaign_scheduling.sql`
16. Review fixes (2026-11-17): `20261117120000_byok_rpc_lockdown.sql`, `20261117120100_review_payment_underpay_guard.sql`, `20261117120200_review_payment_plan_and_lifetime.sql`
17. Whop billing (2026-11-23): `20261123120000_whop_billing.sql`
18. Plan entitlements (2026-11-24): `20261124120000_plan_entitlements.sql`

Every file from step 14 on has a commented rollback at the top.

Phase 7 adds `bot_locale`, `billing_accounts`, `usage_meters`, `client_workspace_prices`, `client_invoices`, `data_deletion_requests`, and `increment_usage`. `data_deletion_requests` is revoked from `anon` and `authenticated`. The status page reads it with the service role.

Confirm:

```sql
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('billing_accounts', 'usage_meters', 'client_workspace_prices', 'client_invoices', 'data_deletion_requests');
select proname from pg_proc where proname = 'increment_usage';
```

## 4. Cron

Vercel Hobby allows only daily crons, so most jobs are scheduled by Supabase
itself with `pg_cron` + `pg_net` (`20261113120000_pg_cron_scheduler.sql`).
After running that migration, store two Vault secrets once in the SQL editor
(never in git):

```sql
select vault.create_secret('https://YOUR-DOMAIN', 'cyreax_cron_base_url');
select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'cyreax_cron_secret');
```

Until both exist the jobs do nothing. To change one later use
`vault.update_secret((select id from vault.secrets where name = '…'), '…')`.

| Route | Schedule | Runner | Job |
| --- | --- | --- | --- |
| `/api/cron/process-inbound-events` | every minute | pg_cron | Inbound queue retries, flow delays, outgoing webhooks |
| `/api/cron/send-scheduled-campaigns` | every 5 minutes | pg_cron | Email campaigns |
| `/api/cron/meta-token-health` | every 6 hours | pg_cron | Flags dead Facebook / WhatsApp / Instagram tokens |
| `/api/cron/refresh-tiktok-tokens` | every 12 hours | pg_cron | TikTok tokens |
| `/api/cron/dunning` | daily 04:23 UTC | pg_cron | Trials, grace, scheduled downgrades, overdue client invoices |
| `/api/cron/client-reports` | daily 05:41 UTC | pg_cron | Agency PDF or link reports |
| `/api/cron/refresh-instagram-tokens` | daily 03:00 UTC | Vercel | Instagram tokens |
| `/api/cron/weekly-coach-digest` | daily 06:00 UTC | Vercel | Coach digest |

Every call sends `Authorization: Bearer $CRON_SECRET`; a missing secret is a
503, a wrong one a 401. Check runs with
`select status_code, created from net._http_response order by created desc limit 5;`
and `GET /api/health` (`checks.queue` should be `ok`). Paid access also ends
at `current_period_end` on every request, so a late dunning run never extends
a plan. `.github/workflows/scheduled-jobs.yml` is a backup runner and can be
disabled once pg_cron is working.

## 5. Meta

In the Meta app, set:

- Instagram redirect: `{APP_URL}/api/instagram/callback`
- Facebook redirect: `{APP_URL}/api/facebook/callback`
- Instagram webhook: `{APP_URL}/api/instagram/webhook`
- Facebook webhook: `{APP_URL}/api/facebook/webhook`
- WhatsApp webhook: `{APP_URL}/api/whatsapp/webhook`
- Privacy policy: `{APP_URL}/privacy`
- Terms: `{APP_URL}/terms`
- Data deletion instructions: `{APP_URL}/data-deletion`
- Data deletion callback: `{APP_URL}/api/meta/data-deletion`
- Deauthorize callback: `{APP_URL}/api/meta/deauthorize`

The callback verifies `signed_request` with HMAC-SHA256 and the app secret. A valid deletion request returns `{ url, confirmation_code }`. The URL is `{APP_URL}/data-deletion?code=hx_…`. Deauthorize clears tokens to `revoked_meta` and sets `reconnect_required`. Deletion also deletes that connection's contacts and conversations. The Cyreax DM login stays.

Requested permissions and the screencast script for each one are in `docs/app-review/`.

## 6. TikTok

Create the developer app, set the redirect to `{APP_URL}/api/tiktok/callback`, and subscribe the webhook to `{APP_URL}/api/tiktok/webhook`. Request the scopes in `lib/tiktok/config.ts`, including `comment.list`. Do not request `video.publish`.

For Egypt and the GCC, apply without the US:

1. Developer app. Include Ad Account Management, CTX Events Management, and Measurement if TikTok requires them on a new app.
2. Accounts API access form: https://bytedance.sg.larkoffice.com/share/base/form/shrlgu4WEvtSXpEDLcCw56u4Rfc
3. Business Messaging review: https://bytedance.sg.larkoffice.com/share/base/form/shrlg7vFArGhg9V20neYCEwIKrb

Turn on `TIKTOK_MESSAGING_ENABLED` after that review. Leave `TIKTOK_US_REVIEW_APPROVED` unset unless the US data security review has passed. Run `supabase/migrations/20260930_phase7_tiktok_windows.sql` so the 10-message window survives a restart. The app still enforces the cap in memory if that table is missing. See `docs/phase4-channels.md`.

## 7. Plans, trial and what each plan includes

Three sold plans: **Starter**, **Pro**, **Agency** (their ids stay `creator`,
`creator_plus`, `agency` because `billing_accounts.plan_id` already stores
them). Everything about a plan is controlled in **Admin → Plans**:

- **Price and billing cycle**, EGP prices, the Whop plan IDs.
- **Limits and features** ("Limits & features" in the plan form): channels,
  contacts, AI replies / month, broadcasts / month, client workspaces, team
  seats (`-1` = unlimited), AI recommendations (off / weekly / daily), and the
  switches for the AI Growth Agent, the public API and white-label. Saved in
  `plans.entitlements` (migration `20261124120000_plan_entitlements.sql`),
  validated on the server, and enforced on every request, so a change applies
  immediately. "Reset to defaults" uses the tier defaults in
  `lib/billing/plans.ts`.
- What customers read on the pricing page, the billing page and the
  choose-a-plan screen is generated from those same limits, so it cannot drift
  from what the server enforces. The plan's own "features" text is added after.

**Free trial:** every new account gets 7 days, no card, with Pro features
(`TRIAL_DAYS` in `lib/billing/plans.ts`, and the `accounts.trial_ends_at`
default). When it ends the account is paused at once (no grace period):
the dashboard is replaced by a screen with the plans, to pay, or **Log out**.
The server blocks the same accounts independently. In **Admin → Users** you can
extend a trial (7 / 14 / 30 days), put an account on a plan for N days, or set
it to Expired to pause it.

## 8. Payments

Two ways to pay, one source of truth (`billing_accounts`):

| Method | Who sees it | How access is granted |
| --- | --- | --- |
| **Card (Whop)** | Everyone | Whop webhook → `billing_accounts` (`payment_provider = 'whop'`) |
| **E-wallet / InstaPay** | Egyptian customers only | Admin approval → `billing_accounts` (`payment_provider = 'manual'`) |

"Egyptian" means the account's saved `accounts.country` is `EG`, or, if none is
saved, Vercel's `x-vercel-ip-country` is `EG` (`lib/billing/region.ts`). The
manual payment API refuses everyone else, not only the UI.

### Whop setup

1. **API key:** Whop → Developer → API keys → Create. Choose "Sell and manage
   subscriptions" or a custom set that can create checkout configurations and
   read memberships and payments. Put it in Vercel as `WHOP_API_KEY`.
2. **Webhook:** Whop → Developer → Webhooks → Create webhook.
   - URL: `{APP_URL}/api/webhooks/whop` (for production:
     `https://cyreax-dm.vercel.app/api/webhooks/whop`)
   - Events: `membership.activated`, `membership.updated`, `payment.succeeded`,
     `payment.failed`, `refund.created`, `refund.updated`
   - Copy the signing secret (starts with `ws_`, keep the prefix) into Vercel as
     `WHOP_WEBHOOK_SECRET`.
3. **Optional:** `WHOP_ACCOUNT_ID` (`biz_…`).
4. **Plans:** in Whop, create a product and one pricing option per plan and
   cycle. In **Admin → Plans**, paste each option's ID (`plan_…`) into
   "Whop plan ID (Mo / one-time)" and, if sold yearly, "Whop plan ID (Yr)".
   A lifetime plan (billing cycle "lifetime") uses the first field.
   "Pay with card" only appears for plans with a Whop plan ID.
5. Redeploy, then send a test event from the Whop dashboard and check the
   delivery shows `200`.

How it works: checkout creates a Whop checkout configuration with metadata
`{ cyreax_ref, cyreax_account_id, cyreax_plan_id }` and records the ref in
`whop_checkouts`. Each webhook is signature-checked, processed once per
`webhook-id`, and re-reads the membership from Whop's API (deliveries can
arrive out of order). The plan granted comes from the Admin → Plans mapping
of the membership's Whop plan, never from metadata; metadata is trusted only
when its ref matches a checkout created for that account and plan. Renewals
move `current_period_end`; cancel-at-period-end keeps access until then;
canceled, expired or a full refund end it. The dunning cron leaves Whop
subscriptions to Whop. Customers manage or cancel at
`https://whop.com/@me/settings/orders/` ("Manage subscription" on Billing).

### Egyptian payments: e-wallet / InstaPay with admin review

### Cyreax DM plans: e-wallet / InstaPay with admin review

1. The customer opens `/checkout/<plan_id>` (the UUID from Admin → Plans).
   The server decides the EGP amount from the plan's `price_egp` /
   `price_yearly_egp` (or `PAYMENT_EGP_PER_USD`), creates a reference code
   such as `CX-7KQ4MZ` and signs both into a quote the browser cannot change.
2. The page shows only the methods whose numbers are configured
   (`PAYMENT_WALLET_NUMBER`, `PAYMENT_INSTAPAY_NUMBER`).
3. The customer transfers, then submits the sender, amount, transaction
   number, time and a screenshot (`POST /api/payments/manual`). The
   screenshot is stripped of metadata and stored in the private
   `payment-proofs` bucket. The payment is **pending**; nothing is unlocked.
4. An admin reviews it in **Admin → Payments**. Approval runs
   `cyreax_review_payment` in one transaction: it locks the row, refuses
   anything not pending (a repeat returns `already_reviewed` and never
   extends twice), and refuses an amount below the quote unless the admin
   chooses **Approve anyway (override)** with a note, which is logged.
5. Approval writes `billing_accounts` with the plan that was bought
   (`plans.catalog_plan_id`), `display_plan_id`, interval `month`, `year`
   or `lifetime`, and `current_period_end` (extended from the current end for
   renewals; `NULL` only for lifetime). Agent access follows the bought plan's
   rows in Admin → Plans.
6. Access ends at `current_period_end`, checked on every request. The
   dunning cron moves the status to past due and then expired, and sends
   reminders.

### Agency client payments (the agency's own keys)

- Stripe commerce and client invoices: `{APP_URL}/api/payments/stripe`, using the workspace secret.
- Paymob commerce and client invoices: `{APP_URL}/api/payments/paymob`.
- Tap: `{APP_URL}/api/payments/tap`. The hash string is HMAC-SHA256 of `x_id`, `x_amount`, `x_currency`, `x_gateway_reference`, `x_payment_reference`, `x_status`, `x_created`.

An upgrade does not change the plan until a payment is approved or the provider reports success. A downgrade is stored on `billing_accounts.scheduled_plan_id` and applied by the dunning cron at period end.

## 9. Health, errors, and the demo

- `GET /api/health` returns 200 with `status: "degraded"` when Supabase env is missing, and 503 when the Supabase auth health check fails.
- Set `SENTRY_DSN` to POST envelopes. Unset, errors are only logged.
- `pnpm seed` loads a demo workspace named Cyreax DM Demo Clinic, an agency named Noir Agency, two contacts, and a client price of 4900 minor units SAR per month on Tap. It refuses to run without `SEED_ACCOUNT_EMAIL`. Do not run it in CI.

## 10. Arabic reports

Client PDF reports embed `lib/pdf/fonts/NotoNaskhArabic-Regular.ttf` (SIL Open Font License, see `lib/pdf/fonts/OFL.txt`). PDF viewers do not shape Arabic, so the generator maps letters to presentation forms before drawing them.
