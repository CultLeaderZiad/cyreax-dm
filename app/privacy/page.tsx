import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import LastUpdated from "@/components/legal/LastUpdated"
import BackToTop from "@/components/ui/BackToTop"
import { BRAND } from "@/lib/brand"

export const metadata = {
    title: `Privacy Policy | ${BRAND.name}`,
    description: `How ${BRAND.name} collects, uses, stores, and protects your data.`,
}

export default function PrivacyPage() {
    return (
        <main id="main-content" className="min-h-screen bg-[#03010A] text-white selection:bg-[#e5a93c] selection:text-black relative">
            <FrontBackground />
            <Header activeHref="/privacy" />
            <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative z-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white">Privacy Policy</h1>
                <LastUpdated />

                <div className="prose prose-invert max-w-none space-y-6 text-neutral-300 mt-10">
                    <p>
                        This Privacy Policy describes how {BRAND.name} is operated and handles information when you use
                        the Service. If you have questions, contact us via{" "}
                        {BRAND.emails.support ? (
                            <a href={`mailto:${BRAND.emails.support}`} className="text-[var(--gold,#D6AE5C)] hover:underline">{BRAND.emails.support}</a>
                        ) : (
                            <span>our support channel</span>
                        )}.
                    </p>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li><strong className="text-white">Account information:</strong> your email address, username, and authentication credentials (managed through Supabase Auth, including optional Google sign-in), and the plan you choose.</li>
                            <li><strong className="text-white">Workspace data you type in:</strong> automation rules, flows, broadcasts, product catalog, and knowledge-base text.</li>
                            <li><strong className="text-white">Connected platform data:</strong> when you connect Instagram, Facebook, WhatsApp, or TikTok, we store the account or page identifiers and the access tokens those platforms issue. Tokens are encrypted at rest. We also store the automation rules you create and the message content those platforms send to our webhooks — including comments, direct messages, and story interactions — so they can appear in your inbox and trigger your automations.</li>
                            <li><strong className="text-white">Contacts:</strong> display name, handle, phone, or email when a person sends that information in a message.</li>
                            <li><strong className="text-white">Telegram bot data:</strong> if you connect a Telegram bot, we store the bot token you provide and the messages your bot receives and sends through {BRAND.short}.</li>
                            <li><strong className="text-white">AI keys (BYOK):</strong> if you connect your own AI provider keys ("Bring Your Own Key" — e.g. Gemini, OpenAI, Anthropic, OpenRouter), those API keys are stored so {BRAND.short} can make AI calls on your behalf. They are never displayed back in full in the dashboard.</li>
                            <li><strong className="text-white">Payment information:</strong> card payments are processed by Stripe, Paymob, or Tap. We never store your full card details on our servers. Those providers share customer identifiers, subscription status, and receipts with us. For manual local cash transfers, we store the transaction reference number, the amount, your name and phone number, and any note you submit, so we can verify and approve your payment.</li>
                            <li><strong className="text-white">Usage data:</strong> basic service telemetry (for example page performance metrics, webhook delivery ids, and error reports) needed to operate and improve the Service.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">2. How We Use Information</h2>
                        <p>We use the collected information solely to:</p>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li>Run your automation rules, post-trigger replies, story responses, and outbound DMs.</li>
                            <li>Render your inbox conversations, contacts list, and performance analytics.</li>
                            <li>Process your subscription and verify manual payment submissions.</li>
                            <li>Send essential transactional notices (receipts, token-expiration warnings, security alerts).</li>
                        </ul>
                        <p className="mt-3">
                            We do not sell personal data, and we do not use your private customer conversations to train public or foundation AI models.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">3. Meta, WhatsApp, and TikTok</h2>
                        <p>
                            Instagram, Facebook, WhatsApp, and TikTok are separate controllers for the data they hold.
                            {BRAND.name} receives only what their APIs deliver after you grant the permissions listed in the
                            app review. Disconnecting a channel, or removing the connection in platform settings, stops new
                            deliveries. The data-deletion instructions and confirmation page are at{" "}
                            <a href="/data-deletion" className="text-[#e5a93c] hover:underline">/data-deletion</a>.
                            Meta&apos;s signed deletion callback is{" "}
                            <span className="text-white">/api/meta/data-deletion</span>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">4. Cookies, Tracking &amp; Embedded Chat Widget</h2>
                        <p>
                            We use a small number of strictly necessary cookies: an authentication session cookie that
                            keeps you logged in, and a language-preference cookie. We do not use advertising or
                            cross-site tracking cookies. See our <a href="/cookies" className="text-[var(--gold,#D6AE5C)] hover:underline">Cookie &amp; Data Processing Policy</a> for
                            the full list and how the cookie banner works.
                        </p>
                        <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                            <h3 className="text-sm font-semibold text-white mb-1">Customer-Facing Web Chat Widget (widget.js)</h3>
                            <p className="text-xs text-neutral-400 leading-relaxed">
                                When agencies or creators embed the live chat widget on external websites, the widget transmits visitor chat prompts, temporary session tokens, and contact identifiers voluntarily entered by the visitor. The widget contains no advertising trackers or third-party cookies. Operators can adapt this notice for their own client-facing privacy pages.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">5. Data Sharing &amp; Sub-Processors</h2>
                        <p>We share data only with the specific services required to run the Service:</p>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li><strong className="text-white">Supabase</strong> — database hosting, authentication, and storage. Your account data, connected-platform tokens, message content, and BYOK keys are stored in Supabase (Postgres).</li>
                            <li><strong className="text-white">Stripe, Paymob, and Tap</strong> — payment processing and subscription billing. Card details are entered on the provider&apos;s secure checkout; we receive only customer identifiers, subscription status, and payment confirmation.</li>
                            <li><strong className="text-white">Meta (Facebook, Instagram, and WhatsApp)</strong> — when you connect Facebook or Instagram, our dashboard loads the Facebook JavaScript SDK (connect.facebook.net) on Connected Platforms to run the OAuth login dialog. When connected, message and comment data flows through Meta&apos;s APIs to run your automations.</li>
                            <li><strong className="text-white">TikTok</strong> — business account identifiers, tokens, comments, and messages delivered through TikTok Business API.</li>
                            <li><strong className="text-white">Telegram</strong> — bot tokens and messages processed via Telegram Bot API.</li>
                            <li><strong className="text-white">AI providers</strong> — message content is sent to your configured AI provider: Groq (platform default for auto-replies), or your BYOK keys (Google Gemini, OpenRouter, Anthropic, OpenAI). Only the text required to generate the specific reply is sent.</li>
                            <li><strong className="text-white">Sentry</strong> — application error monitoring and crash diagnostics. We do not send message bodies, passwords, or access tokens in error reports.</li>
                            <li><strong className="text-white">IPQualityScore (IPQS)</strong> — IP fraud and proxy risk scoring used during OAuth authorization callbacks to protect against bot abuse.</li>
                            <li><strong className="text-white">Vercel Analytics</strong> — privacy-preserving, cookieless telemetry (page views and Web Vitals). No personal or message data is transmitted.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">6. Regional Data Protection Laws (Egypt &amp; GCC)</h2>
                        <p>
                            {BRAND.name} recognizes and adheres to applicable regional data protection frameworks:
                        </p>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li><strong className="text-white">Egypt (Law No. 151 of 2020):</strong> We process personal data in accordance with the Egyptian Personal Data Protection Law. For agencies utilizing {BRAND.name} to manage client messages, {BRAND.name} acts as a <strong className="text-white">Data Processor</strong>, while the agency acts as the <strong className="text-white">Data Controller</strong>.</li>
                            <li><strong className="text-white">Saudi Arabia (PDPL):</strong> Compliance with the Saudi Personal Data Protection Law (Royal Decree M/19). Operators may access, rectify, or request deletion of personal records.</li>
                            <li><strong className="text-white">United Arab Emirates (Federal Decree-Law No. 45 of 2021):</strong> Adherence to the UAE PDPL principles regarding lawful processing, confidentiality, and cross-border transfers.</li>
                            <li><strong className="text-white">Cross-Border Data Hosting:</strong> Primary data stores are hosted in secure EU/US regions by Supabase and Vercel. By using the Service, operators acknowledge and consent to international data transfer subject to standard security safeguards.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">7. Data Retention &amp; Deletion</h2>
                        <p>
                            Connection tokens, conversations, and contacts stay until you disconnect the channel, a
                            Meta data-deletion callback arrives, or you ask us to delete the account. You can disconnect
                            a platform at any time from Connected Platforms. You can request full account deletion
                            and we will delete your data within 30 days. Confirmation status is available at{" "}
                            <a href="/data-deletion" className="text-[#e5a93c] hover:underline">/data-deletion</a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">8. Data Security</h2>
                        <p>
                            Access tokens and BYOK keys are encrypted at rest and never returned in full in the UI.
                            All traffic is encrypted in transit via TLS 1.3/HTTPS.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">9. Your Rights &amp; Requests</h2>
                        <p>
                            You have the right to access, rectify, export, or erase your personal data under GDPR and Egypt/GCC PDPL.
                            To exercise these rights, submit your request to{" "}
                            {BRAND.emails.support ? (
                                <a href={`mailto:${BRAND.emails.support}`} className="text-[var(--gold,#D6AE5C)] hover:underline">{BRAND.emails.support}</a>
                            ) : (
                                <span>our support team</span>
                            )}.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">10. Changes to This Policy</h2>
                        <p>
                            We will update this page and change the &quot;Last updated&quot; date above when this policy changes.
                            Continued use of the Service after a change constitutes acceptance of the updated policy.
                        </p>
                    </section>
                </div>
            </div>
            <Footer />
            <BackToTop />
        </main>
    )
}
