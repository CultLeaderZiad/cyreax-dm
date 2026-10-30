import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import LastUpdated from "@/components/legal/LastUpdated"
import BackToTop from "@/components/ui/BackToTop"
import Link from "next/link"
import { BRAND } from "@/lib/brand"

export const metadata = {
    title: `Terms of Service | ${BRAND.name}`,
    description: `The terms governing your use of the ${BRAND.name} automation platform.`,
}

export default function TermsPage() {
    return (
        <main id="main-content" className="min-h-screen bg-[#03010A] text-white selection:bg-[#e5a93c] selection:text-black relative">
            <FrontBackground />
            <Header activeHref="/terms" />
            <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative z-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white">Terms of Service</h1>
                <LastUpdated />

                <div className="prose prose-invert max-w-none space-y-6 text-neutral-300 mt-10">
                    <p>
                        These Terms of Service (&quot;Terms&quot;) govern your access to and use of {BRAND.name} (&quot;the Service&quot;),
                        (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By creating an account or using the Service, you agree to
                        these Terms and to our <Link href="/privacy" className="text-[var(--gold,#D6AE5C)] hover:underline">Privacy Policy</Link>.
                    </p>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">1. The Service</h2>
                        <p>
                            {BRAND.name} lets a creator or an agency connect messaging channels and reply to people who
                            message them. It automates replies to comments, direct messages, and story interactions on
                            the platforms you connect (Instagram, Facebook/Messenger, WhatsApp, Telegram, and TikTok),
                            using keyword rules, follow-gates, and optional AI-generated responses. You direct what the
                            Service sends on your behalf. You are responsible for the content of your automations and
                            for complying with each platform&apos;s terms, consent rules, messaging windows, and anti-spam
                            policies.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">2. Accounts</h2>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li>You must be allowed to operate the Instagram, Facebook, WhatsApp, Telegram, or TikTok account you connect.</li>
                            <li>You are responsible for safeguarding your account password, API keys, and for all activity under your account.</li>
                            <li>You must provide accurate account and payment contact information.</li>
                            <li>We may suspend or terminate accounts that violate these Terms, are used to spam or phish, or violate a connected platform&apos;s policies.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">3. Plans and Subscriptions</h2>
                        <p>
                            We offer self-serve plans (Creator, Creator Pro, Agency Starter, Agency Growth) and bespoke Enterprise tiers.
                            Subscription terms, renewal cycles, and pricing tiers are detailed on our Pricing page.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">4. Payment Terms</h2>
                        <p>
                            Payments are processed via Stripe, Paymob, or Tap, or via verified local cash transfer methods.
                            All payments are billed in the stated currency. You agree to maintain valid billing details.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">5. Reseller and Client Workspaces</h2>
                        <p>
                            Agency plans allow managing client workspaces. You are responsible for configuring access
                            and securing your client credentials.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">6. Refunds &amp; Cancellation</h2>
                        <p>
                            Our refund and cancellation terms — including how to cancel, what happens to your data, and
                            when refunds are issued — are described in the{" "}
                            <Link href="/refund" className="text-[#e5a93c] hover:underline">Refund &amp; Cancellation Policy</Link>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">7. Acceptable Use</h2>
                        <p>You agree not to use the Service to:</p>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li>Send spam, unsolicited bulk messages, or deceptive content.</li>
                            <li>Violate the Meta Platform Terms, Instagram, Facebook, WhatsApp, or TikTok rules, or Telegram&apos;s terms.</li>
                            <li>Present {BRAND.name} as a Meta or TikTok product.</li>
                            <li>Infringe intellectual-property or privacy rights of others.</li>
                            <li>Attempt to access other users&apos; data, tokens, or keys, or probe or abuse the platform&apos;s infrastructure.</li>
                            <li>Use the API to exceed the limits of your plan.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">8. White-label and API</h2>
                        <p>
                            White-label branding and the public API are available on the plans that include them.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">9. Third-Party Platforms &amp; AI</h2>
                        <p>
                            The Service depends on third-party platforms (Meta, TikTok, Telegram, Supabase, and the
                            payment provider you choose) and AI providers. Messaging platforms can change or revoke
                            access. Outages, API changes, or permission reviews by those providers may interrupt
                            automations. We are not liable for such third-party interruptions, but we will support you
                            in restoring your connections.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">10. Disclaimers &amp; Limitation of Liability</h2>
                        <p>
                            The Service is provided &quot;as is&quot; and as available, without warranties of any kind. To the
                            maximum extent permitted by law, we are not liable for lost messages, rejected payments, or
                            indirect, incidental, special, consequential, or punitive damages, including lost profits,
                            data, or goodwill, arising from your use of or inability to use the Service. Our total
                            liability for any claim is limited to the amount you paid us in the 12 months preceding the
                            claim.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">11. Changes to These Terms</h2>
                        <p>
                            We may update these Terms; the current version and its &quot;Last updated&quot; date always live on
                            this page. Material changes that affect paid subscriptions will be communicated by email or
                            in-app notice before they take effect.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">12. Governing Law &amp; Operator Identity</h2>
                        <p>
                            These Terms are governed by and construed in
                            accordance with the laws of the Arab Republic of Egypt, without regard to conflict of law principles.
                            Any legal dispute arising from or related to the Service shall be subject to the jurisdiction of the
                            competent courts in Cairo, Egypt. For inquiries or notices, contact{" "}
                            {BRAND.emails.support ? (
                                <a href={`mailto:${BRAND.emails.support}`} className="text-[var(--gold,#D6AE5C)] hover:underline">{BRAND.emails.support}</a>
                            ) : (
                                <span>our support team</span>
                            )}.
                        </p>
                    </section>
                </div>
            </div>
            <Footer />
            <BackToTop />
        </main>
    )
}
