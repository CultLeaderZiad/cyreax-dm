import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import LastUpdated from "@/components/legal/LastUpdated"
import BackToTop from "@/components/ui/BackToTop"
import { BRAND } from "@/lib/brand"

export const metadata = {
  title: `Accessibility Statement | ${BRAND.name}`,
  description: `${BRAND.name}'s commitment to web accessibility and conformity to WCAG 2.2 AA standards.`,
}

export default function AccessibilityPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#09090B] text-white selection:bg-[var(--gold,#D6AE5C)] selection:text-black relative">
      <FrontBackground />
      <Header activeHref="/accessibility" />
      <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative z-10">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white">
          Accessibility Statement
        </h1>
        <LastUpdated />

        <div className="prose prose-invert max-w-none space-y-6 text-neutral-300 mt-10">
          <p>
            {BRAND.name} is dedicated to ensuring digital accessibility for all users, including those with disabilities. We continually enhance user experience for everyone and apply relevant accessibility standards.
          </p>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Conformance Standard</h2>
            <p>
              The Web Content Accessibility Guidelines (WCAG) define requirements for designers and developers to improve accessibility for individuals with disabilities. {BRAND.name} aims to conform with <strong>WCAG 2.2 Level AA</strong> standards across all customer and agency dashboard interfaces.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Accessibility Features</h2>
            <ul className="list-disc ps-6 space-y-2 mt-2">
              <li>
                <strong className="text-white">Keyboard Navigation:</strong> All interactive elements, including flow builders, drawer menus, modal dialogs, and conversational composers, are navigable using standard keyboard inputs.
              </li>
              <li>
                <strong className="text-white">Screen Reader Compatibility:</strong> Proper semantic elements, ARIA attributes, and clear labelling are implemented across components.
              </li>
              <li>
                <strong className="text-white">Color Contrast:</strong> Text, badges, and button indicators adhere strictly to WCAG AA minimum contrast ratio (4.5:1 for standard text, 3:1 for large text and UI components).
              </li>
              <li>
                <strong className="text-white">Reduced Motion Support:</strong> The interface honors the <code>prefers-reduced-motion</code> browser setting by disabling decorative micro-animations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Feedback & Contact Information</h2>
            <p>
              We welcome your feedback on the accessibility of {BRAND.name}. If you encounter accessibility barriers, or need accommodation while using our tools, please contact our team:
            </p>
            <ul className="list-disc ps-6 space-y-1 mt-2">
              <li>
                <strong className="text-white">Email:</strong>{" "}
                {BRAND.emails.support ? (
                  <a href={`mailto:${BRAND.emails.support}`} className="text-[var(--gold,#D6AE5C)] hover:underline">
                    {BRAND.emails.support}
                  </a>
                ) : (
                  <span>support</span>
                )}
              </li>
              <li>
                <strong className="text-white">Response Time:</strong> We aim to acknowledge accessibility inquiries within 2 business days.
              </li>
            </ul>
          </section>
        </div>

        <BackToTop />
      </div>
      <Footer />
    </main>
  )
}
