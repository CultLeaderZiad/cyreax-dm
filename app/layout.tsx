import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Noto_Sans_Arabic, Cairo } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"

import { GlobalBanner } from "@/components/layout/GlobalBanner"
import { GlobalUpdatesListener } from "@/components/layout/GlobalUpdatesListener"
import { WebVitalsReporter } from "@/components/performance/WebVitalsReporter"

import { LanguageProvider } from "@/lib/i18n/LanguageContext"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { SWRProvider } from "@/components/swr-provider"
import SkipLink from "@/components/a11y/SkipLink"
import CookieBanner from "@/components/layout/CookieBanner"

const _geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const _geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const _notoSansArabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-noto-arabic", display: "swap" })
const _cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" })

import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  applicationName: BRAND.name,
  title: {
    default: `${BRAND.name} - ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description: `${BRAND.name} — Automate your DMs across Instagram, Messenger, WhatsApp, and Telegram with AI-powered conversation intelligence.`,
  openGraph: {
    title: `${BRAND.name} - ${BRAND.tagline}`,
    description: "Automate your DMs across Instagram, Messenger, WhatsApp, and Telegram with AI-powered conversation intelligence.",
    siteName: BRAND.name,
    images: [{ url: "/brand/cyreax-logo.png", width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} - ${BRAND.tagline}`,
    description: "Automate your DMs across Instagram, Messenger, WhatsApp, and Telegram with AI-powered conversation intelligence.",
    images: ["/brand/cyreax-logo.png"],
  },
  icons: {
    icon: [
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/brand/cyreax-logo.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/brand/icon-32.png",
    apple: "/brand/icon-180.png",
  },
  manifest: "/manifest.json",
  other: {
    "theme-color": "#09090B",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
}

const fontVariables = [_geist.variable, _geistMono.variable, _notoSansArabic.variable, _cairo.variable].filter(Boolean).join(' ')

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="font-sans antialiased bg-[var(--bg)] text-[var(--t1)]" suppressHydrationWarning>
        <ErrorBoundary>
          <SkipLink />
          <LanguageProvider>
            <ThemeProvider>
              <SWRProvider>
                <GlobalBanner />
                <GlobalUpdatesListener />
                <WebVitalsReporter />
                {children}
                <Toaster />
                <CookieBanner />
              </SWRProvider>
            </ThemeProvider>
          </LanguageProvider>
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  )
}
