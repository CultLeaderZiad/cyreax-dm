# Deploy Cyreax DM from zero

Cyreax DM is a Next.js app on Vercel with a Supabase Postgres database. Nothing in this repository applies SQL for you. Run the files below in the Supabase SQL editor, in order, against a backup.

This PR sits on top of the unmerged stack:

1. Phase 1 — secrets, Instagram login, channel bugs
2. Phase 2 — workspaces and the inbound event queue
3. Phase 3 — shared channel pipeline, contacts, analytics
4. Phase 4 — WhatsApp, TikTok, website chat
5. Phase 5 — flows, broadcasts, growth tools
6. Phase 6 — Arabic agent, agency tools, DM commerce
7. Phase 7 — plans, usage, app review, launch (this change)

Merge that stack before this one.

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

Cyreax DM's own subscription:

| Variable | Used for |
| --- | --- |
| `STRIPE_SECRET_KEY` | Subscription Checkout |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` |
| `STRIPE_MONTHLY_PRICE_ID` | Legacy monthly price |
| `STRIPE_ONE_TIME_PRICE_ID` | Legacy one-time price |
| `PAYMOB_API_KEY` | Platform Paymob checkout |
| `PAYMOB_INTEGRATION_ID` | Platform Paymob integration |
| `PAYMOB_IFRAME_ID` | Platform Paymob iframe |
| `PAYMOB_HMAC` | Kept for operators who verify Paymob outside the stored workspace secret |
| `TAP_SECRET_KEY` | Platform Tap charges and the Tap webhook when a workspace has no Tap key |

DM commerce and agency client invoices do **not** read those Paymob or Stripe secrets. The agency saves them under Integrations. They are encrypted with `BYOK_ENCRYPTION_SECRET`. Vodafone Cash stays a manual transfer plus the existing payment submission flow.

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

Phase 7 adds `bot_locale`, `billing_accounts`, `usage_meters`, `client_workspace_prices`, `client_invoices`, `data_deletion_requests`, and `increment_usage`. `data_deletion_requests` is revoked from `anon` and `authenticated`. The status page reads it with the service role.

Confirm:

```sql
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('billing_accounts', 'usage_meters', 'client_workspace_prices', 'client_invoices', 'data_deletion_requests');
select proname from pg_proc where proname = 'increment_usage';
```

## 4. Cron

`vercel.json` schedules:

| Path | Schedule | Notes |
| --- | --- | --- |
| `/api/cron/send-scheduled-campaigns` | daily 00:00 UTC | Email campaigns |
| `/api/cron/weekly-coach-digest` | daily 06:00 UTC | Coach digest |
| `/api/cron/refresh-instagram-tokens` | daily 03:00 UTC | Instagram tokens |
| `/api/cron/refresh-tiktok-tokens` | hourly | TikTok tokens |
| `/api/cron/process-inbound-events` | every minute | Inbound queue, flow jobs, outgoing webhooks |
| `/api/cron/client-reports` | daily 06:00 UTC | Agency PDF or link reports |
| `/api/cron/dunning` | daily 04:00 UTC | Trials, grace, scheduled downgrades, overdue client invoices |

Vercel sends `Authorization: Bearer $CRON_SECRET`. Hobby plans cannot run a minute cron. Use Pro, or call `/api/cron/process-inbound-events` from an external scheduler. Webhooks also drain the queue with `after()`, so the minute cron is the retry path.

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

## 7. Payments

- Stripe subscription webhook: `{APP_URL}/api/stripe/webhook`. Listen for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.deleted`.
- Stripe commerce and client invoices: `{APP_URL}/api/payments/stripe`, using the workspace secret.
- Paymob commerce and client invoices: `{APP_URL}/api/payments/paymob`.
- Tap: `{APP_URL}/api/payments/tap`. The hash string is HMAC-SHA256 of `x_id`, `x_amount`, `x_currency`, `x_gateway_reference`, `x_payment_reference`, `x_status`, `x_created`.
- Vodafone Cash remains the manual instructions on the billing page plus `/api/payments/submit` and admin approval. Approval updates `accounts.plan`. It does not write `billing_accounts` by itself.

An upgrade does not change the plan until the provider reports a successful payment. A downgrade is stored on `billing_accounts.scheduled_plan_id` and applied by the dunning cron at period end.

## 8. Health, errors, and the demo

- `GET /api/health` returns 200 with `status: "degraded"` when Supabase env is missing, and 503 when the Supabase auth health check fails.
- Set `SENTRY_DSN` to POST envelopes. Unset, errors are only logged.
- `pnpm seed` loads a demo workspace named Cyreax DM Demo Clinic, an agency named Noir Agency, two contacts, and a client price of 4900 minor units SAR per month on Tap. It refuses to run without `SEED_ACCOUNT_EMAIL`. Do not run it in CI.

## 9. Arabic reports

Client PDF reports embed `lib/pdf/fonts/NotoNaskhArabic-Regular.ttf` (SIL Open Font License, see `lib/pdf/fonts/OFL.txt`). PDF viewers do not shape Arabic, so the generator maps letters to presentation forms before drawing them.
