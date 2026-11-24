<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

<h1 align="center">⚡ Cyreax DM</h1>

<p align="center">
  <strong>DM automation platform for every channel — Instagram, WhatsApp, Facebook, Telegram, TikTok comment-to-DM funnels, keyword triggers, story replies, AI auto-replies, and a unified live inbox.</strong>
</p>

<p align="center">
  Production-grade DM automation for creators, agencies, and brands — with multi-tenant workspace isolation, Arabic/English bi-directional support, and granular RBAC.
</p>

---

## Getting Started

1. Copy `.env.example` to `.env.local` and populate environment variables:
   ```bash
   cp .env.example .env.local
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run the development server:
   ```bash
   pnpm dev
   ```

## Bootstrapping Platform Admin

A platform admin is an account with `accounts.role = 'admin'`. That is the
only check (`lib/auth.ts` `requireAdmin`, `app/dashboard/admin/layout.tsx`
and the `cyreax_review_payment` SQL function). There is no other admin table;
`platform_admins` is not used by the app.

Sign up once with the admin email, then run in the Supabase SQL editor:

```sql
-- Find the account
SELECT id, email, role FROM accounts WHERE email = 'your-admin@example.com';

-- Make it a platform admin
UPDATE accounts SET role = 'admin' WHERE id = '<account_uuid>';
```

Sign out and back in. The Admin section appears in the sidebar.

## Payments

- **Card (Whop)** for every customer: hosted Whop checkout, plan activated by
  the signed Whop webhook at `/api/webhooks/whop`.
- **E-wallet / InstaPay** for Egyptian customers only: transfer, upload the
  screenshot, an admin approves it in **Admin → Payments**.

Setup (API key, webhook URL and events, mapping plans to Whop plan IDs) and
the required environment variables (`WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`,
`PAYMENT_WALLET_NUMBER`, `PAYMENT_INSTAPAY_NUMBER`, `PAYMENT_EGP_PER_USD`,
`CRON_SECRET`) are in [docs/DEPLOY.md](./docs/DEPLOY.md#7-payments).

---

## Credits & License

Released under the MIT License. Copyright (c) 2026 flexhunt. See [LICENSE](./LICENSE).
This project is derived from open-source DM automation tooling, originally released under the MIT License ("Copyright (c) 2026 flexhunt"). Substantial multi-tenant architecture, local payment processing, channel integrations, dialect routing, and the Cyreax DM dashboard were engineered on top of that base.
