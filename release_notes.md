# ⚡ Cyreax DM v2.0 — Release Notes

## v2.0 — Current

* **Facebook & Messenger automation:** Page connected via Meta Business Manager, comment and Messenger automations.
* **Telegram bot automation:** Connect unlimited bots via bot token, keyword DM rules per bot.
* **Unified dashboard:** Live inbox across Instagram, Facebook Messenger, and Telegram.
* **AI Engine:** Groq-powered auto-replies, sentiment/topic detection, agents, funnels, and growth insights.
* **Free trial per plan, onboarding, announcements:** each plan has its own free trial (days and quota are set by the admin), every new customer sends the details needed to connect their accounts, and the admin controls the announcement bar and the home-page updates block from Settings.
* **AI Growth Agent and recommendations:** recommendation cards on the dashboard are computed from real account data; the Growth Agent (Pro and up) answers questions from that data and proposes changes the customer confirms. Per-plan monthly AI request limits are set in Admin → Plans.
* **Plans:** Starter, Pro and Agency, each with its own features (AI Growth Agent from Pro). The admin controls prices, limits and features per plan from Admin → Plans, with no deploy. Every account starts with a 7-day trial (no card, Pro features); when it ends, the customer chooses a plan and pays, or logs out.
* **Card payments (Whop):** every customer can pay by card through Whop. Plans are mapped to Whop plan IDs in Admin → Plans; the signed Whop webhook activates, renews, cancels and refunds. Whop subscribers manage their subscription on Whop. Requires `WHOP_API_KEY` and `WHOP_WEBHOOK_SECRET`.
* **Billing (Egypt):** Egyptian **e-wallet** (Vodafone Cash, Etisalat Cash, Orange Cash, WE Pay…) and **InstaPay** transfers with screenshot proof and admin approval, offered only to Egyptian customers (saved country, else IP country). Monthly, yearly and lifetime plans; access ends at the paid period end. Requires `PAYMENT_WALLET_NUMBER`, `PAYMENT_INSTAPAY_NUMBER` (optional `PAYMENT_EGP_PER_USD`) and `CRON_SECRET`. Stripe platform billing has been removed.
* **Admin suite:** Users & stats, plan management, payment submission review, agent configuration, email campaigns.

## v1.0.0 — Original base (InstaAuto)

This project started as a fork of the open-source **InstaAuto** project ([ayuuxh2/insta-p8](https://github.com/ayuuxh2/insta-p8), MIT License).

* Instagram DM automation: keyword triggers, buttons, and story mentions.
* Comment-to-DM funnels: auto-reply to post comments with targeted private messages.
* AI auto-replies: Groq/OpenAI integration for natural conversation fallbacks.
* Supabase integration with a unified database schema (`schema.sql`).

## Quick Deployment Guide (self-host)

1. Fork this repository.
2. Create a project on **Supabase** and run `schema.sql` inside the SQL Editor.
3. Create a developer app at **developers.facebook.com** and add the *Instagram Graph API* product.
4. Deploy the fork to **Vercel** and input the environment variables from `.env.example`.
5. Connect your accounts and launch!

---

Cyreax DM is built on the original InstaAuto v1.0.0 base (setup tutorial heritage acknowledged). See [LICENSE](LICENSE) for the MIT license notice of the original project.
