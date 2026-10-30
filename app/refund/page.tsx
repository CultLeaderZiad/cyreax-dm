import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import LastUpdated from "@/components/legal/LastUpdated"
import BackToTop from "@/components/ui/BackToTop"
import Link from "next/link"
import { BRAND } from "@/lib/brand"

export const metadata = {
    title: `Refund & Cancellation Policy | ${BRAND.name}`,
    description: `How to cancel your ${BRAND.name} subscription and when refunds are issued.`,
}

export default function RefundPage() {
    return (
        <main id="main-content" className="min-h-screen bg-[#03010A] text-white selection:bg-[#e5a93c] selection:text-black relative">
            <FrontBackground />
            <Header activeHref="/refund" />
            <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative z-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white">Refund &amp; Cancellation Policy</h1>
                <LastUpdated />

                <div className="prose prose-invert max-w-none space-y-6 text-neutral-300 mt-10">
                    <p>
                        You can cancel your {BRAND.name} subscription at any time. This page explains exactly how
                        cancellation works for each payment method and when refunds are issued. These terms are part
                        of our <Link href="/terms" className="text-[#e5a93c] hover:underline">Terms of Service</Link>.
                    </p>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">1. How to Cancel (Stripe, Paymob &amp; Tap)</h2>
                        <ul className="list-disc ps-6 space-y-2 mt-2">
                            <li>Cancel from your dashboard: go to <strong className="text-white">Billing &amp; Subscription</strong> and select "Cancel subscription". A confirmation dialog will appear before the cancellation is applied.</li>
                            <li>Cancellation stops all future recurring charges immediately across Stripe, Paymob, or Tap.</li>
                            <li>Your plan stays active until the end of the period you already paid for. After that, your account moves to the expired state: your data and configuration are preserved, but automations pause until you renew.</li>
                            <li>We do not charge cancellation fees, ever.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">2. Vodafone Cash (Manual) — Renewal &amp; Cancellation</h2>
                        <p>
                            Manual local cash payments do not automatically charge your account or auto-renew.
                            To cancel, simply do not submit a renewal payment at the end of your billing cycle.
                            Your plan will gracefully transition to expired when your active period concludes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">3. Refund Eligibility</h2>
                        <p>
                            We offer refunds within 7 days of initial subscription purchase if you experience technical
                            issues that prevent normal use of the service and our support team cannot resolve them.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">4. Processing Time</h2>
                        <p>
                            Approved refunds for card transactions are processed within 5 to 10 business days depending
                            on your bank or card issuer. Local wallet refunds are returned to the originating wallet within 48 hours.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">5. Account Data After Cancellation</h2>
                        <p>
                            Canceling does not delete your data. Your automations, inbox history, and settings are
                            preserved and reactivate if you subscribe again. You may request full deletion at any time
                            (see the <Link href="/privacy" className="text-[var(--gold,#D6AE5C)] hover:underline">Privacy Policy</Link>).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">6. Questions &amp; Support</h2>
                        <p>
                            For cancellation help, refund requests, or payment questions, reach us via{" "}
                            {BRAND.emails.billing || BRAND.emails.support ? (
                                <a href={`mailto:${BRAND.emails.billing || BRAND.emails.support}`} className="text-[var(--gold,#D6AE5C)] hover:underline">
                                    {BRAND.emails.billing || BRAND.emails.support}
                                </a>
                            ) : (
                                <span>our support channels</span>
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
