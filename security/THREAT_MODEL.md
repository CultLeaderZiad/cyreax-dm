# Cyreax DM threat model

Written 2026-11-07 from the code at `efb0512` (main) and the fixes that follow it. Each claim points at the code. Database state comes from the SQL files in the repo. **The live Supabase project was not inspected**, so live RLS, grants and storage policies are UNVERIFIED.

## 1. What the system is

| Layer | What it is (verified in code) |
|---|---|
| App | Next.js App Router (`next` 16.4.3 after this audit, 16.0.10 before), React 19.2, TypeScript, Tailwind 4 |
| Hosting | Vercel. Crons are in `vercel.json`: `process-inbound-events` every minute, `refresh-instagram-tokens` and `weekly-coach-digest` daily |
| Data | Supabase Postgres, Auth and Storage. The schema is spread across `schema.sql`, `scripts/*.sql` (applied by hand) and `supabase/migrations/*.sql` (also applied by hand, see `supabase/migrations/README.md`) |
| AI | `lib/llm-provider.ts` `generateCompletion`. Managed Groq, Gemini, OpenRouter, Anthropic and OpenAI keys, plus per-account BYOK keys (encrypted) |
| Channels | Instagram, Facebook/Messenger, WhatsApp Cloud API, Telegram bots, TikTok (gated by `TIKTOK_MESSAGING_ENABLED`, `lib/tiktok/config.ts`), web chat widget |
| Payments | Paymob and Tap callbacks (HMAC-verified), manual/Vodafone Cash submissions, plus Stripe routes and the `stripe` dependency left over from before |
| CI | `.github/workflows/ci.yml` runs tsc, `pnpm test` and `next build`. A report-only security job was added in this audit |

### How data access works

Nearly every server route calls `getSupabaseBypassClient()` (`lib/supabase-server.ts:66`), which uses the **service-role key and bypasses RLS**. Tenant isolation therefore depends on the application code:

- `lib/auth.ts` `loadWorkspaceContext` resolves the account from the Supabase Auth cookie, then the workspace from the `x-cyreax-workspace` header, then the cookie, then `active_workspace_id`, then an owned workspace. A header that names a workspace the caller doesn't belong to is denied (`lib/auth.ts:144`).
- Business rows are keyed by `user_id` = `users.id`, which is the per-workspace profile. Routes must add `.eq("user_id", igUser.id)` to every query.
- Role gates: `authorizeWorkspaceAction` covers write methods (`lib/workspace-access.ts:43`). `forbidBelow(role,"admin")` guards channel connect and disconnect.

RLS still matters, because the **anon key is public** (it ships in the browser bundle) and the browser calls Supabase directly for auth, realtime (`components/inbox/ChatWindow.tsx:261`, `hooks/use-instagram-session.ts:221`) and one admin read (`app/dashboard/admin/page.tsx:188`).

## 2. Actors

| Actor | How they authenticate | What they can reach |
|---|---|---|
| Anonymous internet user | none | Public routes: `/api/newsletter/subscribe`, `/api/enterprise`, `/api/public/bio/[slug]`, `/api/share/report/[token]`, `/r/[code]`, `/widget.js`, `/api/webchat/*`, `/api/plans`, `/api/settings/banner`, auth callbacks. Also **PostgREST directly with the anon key** |
| User A / User B (tenants) | Supabase Auth session cookie | Every route behind `requireSessionUser` / `workspaceSession`. Anyone can sign up, and each signup owns a default workspace (`lib/workspaces.ts` `ensureDefaultWorkspace`), so **"admin of some workspace" is the baseline attacker** |
| Workspace member roles | `workspace_members.role` | client-viewer reads. member writes automations and the inbox. admin connects channels and manages members. owner handles billing |
| Platform admin | `accounts.role = 'admin'` | `/api/admin/*` through `requireAdmin` (`lib/auth.ts:261`) |
| Public API client | `Authorization: Bearer hx_live_…` (hashed lookup, `lib/integrations/api-auth.ts`) | `/api/v1/contacts` for one workspace |
| Cron (Vercel) | `Authorization: Bearer $CRON_SECRET`, compared in constant time, 503 when unset (`lib/cron-auth.ts`) | `/api/cron/*` |
| Webhook senders | Meta `X-Hub-Signature-256` over the raw body; TikTok `TikTok-Signature`; Telegram bot token in the URL path; Paymob/Tap per-tenant HMAC | `/api/{instagram,facebook,whatsapp,tiktok}/webhook`, `/api/telegram/webhook/[token]`, `/api/payments/{paymob,tap}`, Meta deletion/deauthorize (`signed_request`) |
| Worker | runs inside the webhook `after()` hook and the cron | `lib/inbound-worker.ts` drains `inbound_events` |
| Web chat visitor | widget public key + per-visitor secret (hashed) + Origin allow-list | `/api/webchat/*`, rate-limited at 20 per minute (`lib/webchat/security.ts`) |

## 3. Assets

| Asset | Where it lives | Protection |
|---|---|---|
| Meta/IG/WA/TikTok/Telegram access tokens | `users.access_token`, `platform_connections.access_token` | `sealAccessToken` (AES-GCM, `BYOK_ENCRYPTION_SECRET`) |
| BYOK LLM keys | `account_agent_settings` (RPC) | encrypted; column revoke (see AUDIT P2-6) |
| Integration secrets (Paymob, Tap, Shopify, Woo, HubSpot, Sheets) | `integration_configs.secret_ciphertext` | encrypted |
| OAuth hand-off tokens | `oauth_sessions.token_encrypted` | encrypted, one-time, `REVOKE ALL` from anon/authenticated |
| SMTP credentials | `app_settings` key `smtp_settings` | **was plaintext and publicly readable** (AUDIT P0-2), now sealed |
| Contacts, conversations, messages, leads | `contacts`, `conversations`, `messages`, `leads` | app-level `user_id` scoping, plus RLS select policies (phase 1) |
| Campaigns/broadcasts, flows, automations, comment triggers | `broadcasts`, `flows`, `automations` | app-level scoping |
| Exports | `/api/contacts/export` (CSV) | same loader as the contact list, scoped |
| Billing records | `payment_submissions`, `manual_payments`, `payment_intents`, `payment_receipts`, `client_invoices` | RLS is missing on some of these (AUDIT P1-5) |
| Platform keys | Vercel env (`GROQ_API_KEY`, app secrets, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) | server-only. No `NEXT_PUBLIC_` secrets, and no client file references the service role (checked) |
| Paid capacity | LLM providers, Meta/WhatsApp sends, SMTP | per-account daily AI cap, aiReplies plan meter, inbound 30 per minute per account; per-minute and global LLM caps added in this audit |

## 4. Trust boundaries

1. **Browser → Next.js API.** Cookie auth with SameSite=Lax Supabase cookies. Everything in the body, query and headers is untrusted, including `x-cyreax-workspace`.
2. **Browser → Supabase (anon key).** Postgres RLS is the only control here.
3. **Next.js → Supabase (service role).** No database-side control. Correctness depends on every query filtering by tenant.
4. **Meta/TikTok/Telegram/Paymob/Tap → webhooks.** Signature or HMAC over the raw body. The tenant is derived from DB lookups by page, phone or bot id, never from a field the sender controls.
5. **Next.js → third parties.** Graph API, LLM providers, and tenant-configured URLs (outgoing webhooks, Shopify/Woo, URL import). This is the SSRF boundary.
6. **Tenant-configured channel identifiers.** `platform_connections.page_id` decides which workspace receives a page's or number's webhooks. **Claiming an identifier must require proof of control** (AUDIT P0-1).

## 5. Data flow: webhook → queue → LLM → outbound send

```
Meta POST /api/instagram/webhook
  │ raw body → HMAC-SHA256(app secret) vs X-Hub-Signature-256 (timingSafeEqual)
  │   missing secret → 401 (fail closed); dev bypass only when NODE_ENV and VERCEL_ENV != production
  ▼
splitInboundEvents (lib/event-pipeline.ts)
  │ one row per logical event, idempotency_key = platform:messaging:<mid> | whatsapp:message:<wamid> | telegram:<bot>:<update_id> | tiktok:<event>:<id>
  │ read/delivery/echo receipts dropped (prevents reply-to-own-reply loops)
  ▼
inbound_events INSERT (unique idempotency_key → 23505 = duplicate, ignored)
  ▼
drainInboundEvents (after() and the every-minute cron)
  │ claim_inbound_events: FOR UPDATE SKIP LOCKED, 120 s lock
  │ take_inbound_rate_slot(account_key, 30/min) → defer if full
  │ failure → exponential backoff (15 s base, 15 min cap), dead after 5 attempts
  ▼
channels/ingress → pipeline: connection looked up by entry.id/page_id/phone_number_id in platform_connections
  │ → automations/flows match → AI agent (assertWithinLimit aiReplies) → generateCompletion
  │      → agent toggle → daily cap (300/identity) → [new] per-account 30/min + global 600/min → provider
  ▼
outbound send via the channel adapter, using the tenant's decrypted token
```

Residual risks on this path are listed in AUDIT_REPORT §P2. The main one: a dispatch that sends and then throws is retried, and an individual send has no idempotency key, so a partial failure can produce a duplicate reply (UNVERIFIED in a live run).
