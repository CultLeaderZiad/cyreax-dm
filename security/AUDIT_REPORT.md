# Cyreax DM security audit report

Date: 2026-11-07. Baseline: `main` at `efb0512`. Scope: the whole repository, which includes the API routes, lib, middleware, SQL, CI and dependencies. The audit was read-only against the repo. No traffic was sent to third-party systems, and no live exploitation was attempted.

**Legend:** **Fixed** = patched and tested in this audit. **Open** = reported only. UNVERIFIED = depends on state I could not inspect: the live Supabase DB, Vercel settings, provider consoles, and the full git history (the clone is shallow).

## What was run

| Check | Result |
|---|---|
| `pnpm exec tsc --noEmit` | pass |
| `pnpm test` | 226 + 16 pass, 0 fail. The baseline was 178 |
| `pnpm build` (no Supabase env, same as CI) | pass |
| `pnpm install --frozen-lockfile` | **failed on baseline**: the lockfile specifier didn't match. Fixed |
| `pnpm audit --prod` | baseline 4 critical / 23 high. After the fixes: 0 critical / 3 high (nodemailer ×2, source-map-js) |
| gitleaks 8.21.2 `dir` (working tree, redacted) | no findings outside `node_modules` / `.next` |
| gitleaks `git` (history, redacted) | no findings, **but the clone is shallow (73 commits)**, so the historical Groq keys that `.env.example` mentions were not reachable. UNVERIFIED. The new CI job scans the full history |
| Service-role key in the client | no `"use client"` file references `getSupabaseBypassClient` or `SUPABASE_SERVICE_ROLE_KEY`. No secret env names appear in `.next/static` |
| Live site / Vercel deploy check | **not possible**: this sandbox's network policy blocks `*.vercel.app`, and `git push` to GitHub was refused (403). UNVERIFIED |

---

## P0

### P0-1 Facebook Page takeover across tenants (**Fixed**)
- **Evidence (baseline):** `app/api/facebook/connect/route.ts:56` set `userAccessToken = _token || body.page_token || ""` from the client. Lines 166 and 172 set `pageAccessToken = userAccessToken` when Graph returned no Page token. Lines 195 and 199 forced `webhookSubscribed = true` even on failure. Line 233 looked up the existing row by `(platform, page_id)` only and **updated** it to the caller's `user_id/account_id/workspace_id`.
- **Impact:** any signed-up user could claim any Facebook Page id, including one already connected by another tenant. Inbound webhooks route by `page_id`, so the victim's Messenger DMs and comments (customer PII) would flow into the attacker's inbox, and the victim's stored Page token would be overwritten, breaking their automations. It also wrote a fake "active, webhook subscribed" state.
- **Exploit sketch:** sign up → `POST /api/facebook/connect {"page_id":"<victim page>","page_token":"x"}`. The route saves the row as active and re-points the existing connection.
- **Fix:** `lib/meta/page-connect.ts` `resolveVerifiedPageToken`. The Page token must be returned by Graph (`/me/accounts` or `/{page}?fields=access_token`) for the caller's **server-held** user token. Client tokens are ignored, the page id must be numeric, and `webhook_subscribed` reflects Graph's real answer.
- **Tests:** `tests/security-audit.test.mts`, "facebook page connect requires proof of page control" (5 cases).
- Other connect paths were checked: WhatsApp verifies through Graph and refuses numbers owned by another account (`app/api/whatsapp/connect/route.ts` `upsertNumber`). Telegram proves control with the bot token. The FB, Instagram and TikTok OAuth callbacks take ids from the OAuth identity.

### P0-2 SMTP credentials publicly readable via the anon key (**Fixed in code; migration must be run**)
- **Evidence:** `scripts/34-schema-app-settings.sql:20-24` creates `"Public read access for app_settings" FOR SELECT TO authenticated, anon USING (true)`. `app/api/admin/settings/smtp/route.ts:41` (baseline) stores `{host, port, user, pass, …}` in plaintext under `app_settings.smtp_settings`.
- **Impact:** anyone with the public anon key (it's in the JS bundle) could read the platform SMTP username and password, then send mail as the platform to every customer (phishing) and burn the sending reputation. Live state is UNVERIFIED: it depends on whether scripts/34 was applied, which `settings/updates` reading `app_settings` through the RLS client suggests.
- **Exploit sketch:** `GET https://<project>.supabase.co/rest/v1/app_settings?key=eq.smtp_settings` with `apikey: <anon key>`.
- **Fix:** migration `supabase/migrations/20261107120000_security_app_settings_rls.sql` allows anon/authenticated reads only for `update_banner` and `updates_page`, and revokes writes. The password is stored as `pass_encrypted` (`lib/smtp-settings.ts`). Legacy plaintext is still readable and gets re-sealed on save. The admin GET no longer returns the password.
- **Tests:** "smtp settings never expose the password" (4 cases).
- **Manual:** run the migration, then **rotate the SMTP password**, because it should be treated as exposed.

### P0-3 Next.js 16.0.10 with critical unauthenticated RCE advisories (**Fixed**)
- **Evidence:** `package.json:33` `"next": "16.0.10"`. `pnpm audit` lists GHSA-2xp9-vwfh-vxw4 and GHSA-2464-fhr4-w9xw (RCE in Image Optimization via AVIF/SVG). `next.config.mjs` enables `formats: ['image/avif', …]`. There is also a middleware bypass via dynamic params, SSRF, and DoS.
- **Impact:** possible server compromise, which means environment secrets: service role, app secrets, LLM keys.
- **Fix:** upgraded to `next@16.4.3` (published 2026-10-23), which is at or above every patched range. tsc, tests and build pass.
- **Manual:** confirm the Vercel deploy and smoke-test login, the inbox and images (UNVERIFIED from here).

## P1

### P1-1 Open redirect after sign-in / email confirmation (**Fixed**)
- **Evidence (baseline):** `app/auth/callback/route.ts:9,15` and `app/auth/confirm/route.ts:9` use ``NextResponse.redirect(`${origin}${next}`)`` with `next` taken raw from the query. `safeAuthNext` existed but was only used in `app/api/auth/callback`.
- **Exploit:** `/auth/callback?code=…&next=@evil.com` redirects to `https://cyreax-dm.vercel.app@evil.com`, whose host is `evil.com`. This is phishing right after a real login.
- **Fix:** both routes now use `safeAuthNext`. **Tests:** "every auth redirect route validates next" (4 cases, including `@evil.com`, `.evil.com`, `/%5Cevil.com`).

### P1-2 Facebook OAuth without `state` (login CSRF / account-linking CSRF) and code logging (**Fixed**)
- **Evidence (baseline):** `app/api/facebook/auth/route.ts` sends no `state`. `app/api/facebook/callback/route.ts:16-18` logs every query value, including `code`.
- **Impact:** an attacker can make a logged-in victim finish the attacker's Facebook login, which links the attacker's FB identity and Pages into the victim's workspace. Authorization codes also land in Vercel logs.
- **Fix:** an httpOnly `fb_oauth_state` cookie plus a timing-safe compare before the code exchange, the same pattern as Instagram and TikTok. Only param names are logged. **Tests:** "facebook oauth is bound to the browser…".

### P1-3 Hardcoded webhook verify tokens in a public repo, case-insensitive compare (**Fixed**)
- **Evidence:** `app/api/{instagram,facebook,whatsapp}/webhook/route.ts` (baseline lines 19-27) list three literal tokens and compare them with `toLowerCase()`.
- **Impact:** low on its own, because POSTs need the HMAC. But anyone could pass the subscription handshake, and the tokens can never be rotated.
- **Fix:** `lib/webhooks/verify-token.ts` accepts env tokens only, with an exact constant-time match, and fails closed when none is configured. **Manual:** make sure a `*_WEBHOOK_VERIFY_TOKEN` env var is set before you re-verify in the Meta dashboard.

### P1-4 Unauthenticated email relay with HTML injection (`/api/newsletter/subscribe`) (**Fixed**)
- **Evidence (baseline):** `app/api/newsletter/subscribe/route.ts:31` interpolates the raw `name` into HTML. Line 103 sends from the platform SMTP account on every call, with no limit.
- **Impact:** spam or phishing through the platform's domain, to any address, with attacker-controlled HTML. That ruins deliverability for real customer mail.
- **Fix:** Postgres-backed limits (`lib/rate-limit.ts`, which reuses `take_inbound_rate_slot`; no new vendor): 5 per hour per IP (429), 1 welcome mail per address per day, 200 per hour globally. The name is escaped and capped. **Tests:** "abuse and cost limits".

### P1-5 Tables never placed under RLS, and anonymous write access to the media bucket (**Migration written; live state UNVERIFIED**)
- **Evidence:** no SQL in the repo enables RLS on `admin_audit_log` (scripts/04), `manual_payments` (scripts/31: client name, phone, amount), `payment_methods` and `plans` (scripts/16), or `sessions` (scripts/02). `scripts/05-create-media-bucket.sql:9-31` and `scripts/08-fix-storage-permissions.sql:17-21` grant the `public` role INSERT/UPDATE/DELETE on `media`. `scripts/25` drops only `"Public Access"`.
- **Impact:** with Supabase default grants, the anon key could read Vodafone Cash payment records, rewrite plan prices, and upload, overwrite or delete public media.
- **Fix:** `supabase/migrations/20261107120100_security_rls_gaps_and_storage.sql` enables RLS, revokes writes, adds admin-only and owner-only SELECT policies, and drops the legacy storage policies. The app only touches these tables with the service role.
- **Manual:** run it, then run the verification query in its footer (it should find no `public` tables with RLS off).

### P1-6 LLM spend: no burst or global ceiling (**Fixed**)
- **Evidence:** `lib/groq-client.ts:4` sets 300 calls per day per identity. Line 75 caches the count per instance for 30 s. Nothing bounds total platform spend.
- **Impact:** concurrent requests overshoot the daily cap, and many cheap signups multiply spend.
- **Fix:** `generateCompletion` takes a per-account slot (30/min) and a global slot (600/min) before any provider call, and fails closed. Both are tunable through env. **Tests:** a 500-call retry storm gets 30 through; 100 accounts cap at 600; a store error refuses the call.
- **Manual:** set **provider-side spend caps** in Groq, Gemini, OpenRouter, Anthropic and OpenAI. Alerts alone don't stop spend.

### P1-7 CI could not install (**Fixed**)
- `pnpm-lock.yaml` recorded `@supabase/supabase-js` as `latest` while `package.json` pins `2.117.3`, so `--frozen-lockfile` failed. This means CI on `main` was red before tsc or tests even ran (the GitHub run itself is UNVERIFIED).

### P1-8 Historical Groq keys in git history (**Open — manual**)
- `.env.example:19-23` states that live Groq keys exist in the public repo's history. Values were not printed and not checked: the shallow clone doesn't contain them.
- **Action for Ziad:** revoke them in the Groq console now, if that hasn't been done, and confirm with the new CI gitleaks job, which scans full history and redacts values. Rewriting history does not un-leak a key. Rotation is the fix.

## P2 (open unless noted)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| P2-1 | SSRF in the Shopify/WooCommerce sync. Arbitrary host, response stored in `products`; Woo secret sent over http | `lib/commerce/sync.ts:5,15` (baseline) | **Fixed**: `isSafeWebhookUrl` + bare hostname. Tests: 13 cases |
| P2-2 | SSRF guard checks the host string only, with no DNS resolution: a public name resolving to a private IP passes. Applies to the URL importer, flow webhooks and outgoing webhooks | `lib/flows/graph.ts:62-78` | **Fixed** (`a4988d6`): `lib/net/public-host.ts` resolves DNS and requires every address to be public, for URL import, outgoing webhooks (checked again at send time) and flow webhooks. Residual: DNS rebinding between the check and the fetch |
| P2-3 | Telegram bot token in the webhook URL path, so it lands in Vercel access logs | `app/api/telegram/connect/route.ts:75` | Use `setWebhook` `secret_token` + `X-Telegram-Bot-Api-Secret-Token`, with a per-bot random path. Needs a re-register of every bot, so it was deliberately not done in this pass |
| P2-4 | No CSP or HSTS header; `X-XSS-Protection` is obsolete | `next.config.mjs:23-50` | **Partly fixed** (`085a92c`): HSTS (1 year), Permissions-Policy, `X-XSS-Protection: 0`. **Open:** CSP (roll it out report-only first). `dangerouslySetInnerHTML` is used only for a server-generated QR SVG |
| P2-5 | Retry after a partial send can double-send: there's an idempotency key per event, but not per outbound message | `lib/inbound-worker.ts:52-82` | Record a send key (event id + step) before calling the provider and skip it if it already exists |
| P2-6 | Column-level `REVOKE SELECT (access_token)` is a no-op while table-level SELECT is granted (Supabase default) | `supabase/migrations/20260930_phase1_rls_realtime.sql:266,273` | Tokens are encrypted at rest, so impact is low. To really hide the column, revoke table SELECT and grant a column list. Check the realtime and admin-page reads first |
| P2-7 | Inbound rate limiter fails open if the bucket read errors | `lib/inbound-worker.ts:125-127` | **Fixed** (`4720ceb`): the event is deferred |
| P2-8 | Team invite accepted on an email match only; relies on Supabase "Confirm email" being on | `app/api/team/accept/route.ts:47` | **Fixed** (`50b5383`): requires `email_confirmed_at` on the Supabase Auth user. Tests: unconfirmed 403, other account 404, confirmed 200 |
| P2-9 | Public lead and web chat endpoints rely on Origin (spoofable outside browsers) plus 20/min/IP; the bio lead form has no limit | `lib/webchat/security.ts`, `app/api/public/bio/[slug]/route.ts:17` | **Fixed for bio** (`2c167aa`): 10/hour per IP, 300/hour per page. Web chat keeps its own 20/min limiter, and AI replies are plan-metered |
| P2-10 | Dev signature bypass is allowed on `VERCEL_ENV=preview` when `NODE_ENV` isn't production (on Vercel, `NODE_ENV` is production, so this is effectively off) | `lib/webhooks/signature-guard.ts:12` | **Fixed** (`227f357`): the bypass is refused whenever `VERCEL_ENV` is set |
| P2-11 | Crons exist but aren't scheduled: `refresh-tiktok-tokens`, `send-scheduled-campaigns`, `dunning`, `client-reports`, `process-inbound-events` | `vercel.json` vs `app/api/cron/*` | **Open (plan limit).** Production deploys had failed since `efb0512` because it added a `* * * * *` cron, which Vercel Hobby rejects. `720cb5c` restores the two-cron config that last deployed, and drops the TikTok cron from `08fa9b7`. The queue is still drained by the webhook `after()` hook. To run the rest, upgrade to Pro or call them from an external scheduler with `Authorization: Bearer $CRON_SECRET` |
| P2-12 | Leftover Stripe dependency and routes after the move to Vodafone Cash/Paymob | `package.json:44`, `app/api/stripe/*`, `app/api/payments/stripe` | Remove if unused, after checking the billing UI. Not removed here (no sweeping changes) |
| P2-13 | nodemailer `<10.0.6` addressparser ReDoS (high), source-map-js DoS | `pnpm audit` | Upgrade nodemailer to 10.x (major version: test sending) |
| P2-14 | `x-forwarded-for` first hop is used as the client IP for limits | `lib/rate-limit.ts`, `lib/webchat/security.ts` | **Fixed** (`2c167aa`): `x-vercel-forwarded-for` is preferred |
| P2-15 | `next.config` `removeConsole` keeps `error`/`warn`, and some error logs include Supabase error objects and emails (e.g. `lib/auth.ts:70-75`) | various | Redact emails and IDs in logs. Sentry is env-gated (`SENTRY_DSN`); scrub PII before sending |

## Verified as fine (spot checks)
- Webhook HMAC over the raw body with `timingSafeEqual`, failing closed without a secret (IG/FB/WA/TikTok). Tests were added.
- Idempotent queue on a unique `idempotency_key`; echo/read/delivery events dropped; bounded retries with backoff; per-account inbound rate limit.
- Cron auth fails closed (503 without a secret, 401 on a wrong secret) on all 7 cron routes. Tests were added.
- Paymob/Tap: per-tenant HMAC, binding to the signed provider id, amount/currency check, compare-and-set `pending→paid`.
- Meta data-deletion `signed_request` HMAC verification (`lib/meta/signed-request.ts`).
- Instagram/TikTok OAuth state; WhatsApp number ownership; workspace header spoofing denied.
- Object-level scoping on contacts, automations, inbox, flows, broadcasts, connections, knowledge, AI suggestions and webchat widgets (route-level tests in `tests/tenant-isolation.test.mts`).
- `/api/instagram/test-login` is locked to `NODE_ENV=development` + `ENABLE_DEV_TEST_LOGIN=true`.

## Tests added
- `tests/security-audit.test.mts`: page-control proof, SMTP masking, open-redirect payloads, FB OAuth state, verify token, **forged and missing-secret webhook signatures (route level)**, **duplicate delivery → exactly one queued event**, **cron without or with the wrong secret**, **retry storm bounded by the limits**, SSRF store URLs.
- `tests/tenant-isolation.test.mts`: **user B denied reading, updating or deleting user A's contacts, contact export, automations, conversations/messages, integrations, broadcast campaigns and flows; anonymous denied (401); workspace header spoofing 403; A still allowed.** These run the real handlers against an in-memory Supabase fake. They do **not** exercise live RLS (UNVERIFIED).

## Commits (local, oldest first) and rollback

| Commit | Change | Rollback |
|---|---|---|
| `db07ef4` | lockfile specifier fix | `git revert` (CI breaks again) |
| `2427016` | P0-1 FB page proof | `git revert`; no data migration |
| `57ac739` | P0-2 SMTP sealing + migration 20261107120000 | `git revert`. Rows already saved as `pass_encrypted` would then need the plaintext re-entered in the admin UI. SQL rollback is in the migration header |
| `1344671` | P1-1 open redirect | `git revert` |
| `6e70d40` | P1-2 FB OAuth state | `git revert` |
| `fc118f6` | P1-3 verify tokens | `git revert` (restores the leaked tokens; avoid) |
| `d106ca0` | webhook/cron/dedupe tests + loader | `git revert` (tests only) |
| `c2ec1a1` | P1-4 newsletter limits + `lib/rate-limit.ts` | `git revert` |
| `f889caa` | P1-6 LLM burst/global caps | `git revert`, or raise `LLM_*_PER_MINUTE` env vars |
| `7ccc372` | P1-5 RLS/storage migration 20261107120100 | SQL rollback is in the migration header |
| `1af64de` | P2-1 store URL SSRF | `git revert` |
| `a8afd31` | tenant isolation tests | `git revert` (tests only) |
| `c31ee98` | P0-3 Next 16.4.3 | `git revert` (restores the vulnerable 16.0.10) |
| `1ebe7e8` | CI report-only security job | `git revert` |
| `4720ceb` | P2-7 inbound limiter fails closed | `git revert` |
| `227f357` | P2-10 no signature bypass on any Vercel env | `git revert` |
| `50b5383` | P2-8 confirmed email for invites | `git revert` |
| `a4988d6` | P2-2 DNS-resolving SSRF check | `git revert` |
| `2c167aa` | P2-9/P2-14 bio lead limits, Vercel IP header | `git revert` |
| `085a92c` | P2-4 HSTS / Permissions-Policy | `git revert`. Browsers cache HSTS for a year either way, which is harmless on an HTTPS-only app |
| `08fa9b7` | TikTok refresh cron scheduled (superseded by `720cb5c`) | n/a |
| `720cb5c` | restore Hobby-compatible crons; **fixes failing production deploys** | re-adding a sub-daily cron breaks deploys on Hobby again |

The hashes are local. If the commits are re-applied through another route, the hashes will differ.
