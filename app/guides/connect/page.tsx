import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"

export const metadata: Metadata = { title: "How to find your account details" }

const section = "scroll-mt-28 rounded-2xl border border-white/10 bg-[#0d0e13] p-6 space-y-3"

export default function ConnectGuidePage() {
  return (
    <div className="relative flex min-h-screen flex-col justify-between text-white">
      <FrontBackground />
      <div>
        <Header />
        <main className="relative z-10 mx-auto max-w-2xl space-y-6 px-6 pb-24 pt-12">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">How to find your account details</h1>
            <p className="text-neutral-300">We connect your accounts for you. These are the three things we may ask for, and where to find each one.</p>
          </div>

          <section id="instagram" className={section}>
            <h2 className="text-lg font-semibold">Instagram username</h2>
            <ol className="list-decimal space-y-1.5 ps-5 text-neutral-300">
              <li>Open your Instagram profile.</li>
              <li>Your username is the name at the top, without the @. For example <code className="rounded bg-white/10 px-1.5">mybrand</code>.</li>
              <li>The account needs to be a Business or Creator account. If it is personal, switch it in Settings, Account type and tools.</li>
            </ol>
          </section>

          <section id="facebook" className={section}>
            <h2 className="text-lg font-semibold">Facebook Page ID</h2>
            <ol className="list-decimal space-y-1.5 ps-5 text-neutral-300">
              <li>Open your Facebook Page on a computer.</li>
              <li>Go to About, then Page transparency, then See all.</li>
              <li>Copy the Page ID. It is a long number such as <code className="rounded bg-white/10 px-1.5">105298374612345</code>.</li>
            </ol>
            <p className="text-sm text-neutral-400">It is the number, not the Page name. You must be an admin of the Page.</p>
          </section>

          <section id="telegram" className={section}>
            <h2 className="text-lg font-semibold">Telegram bot token</h2>
            <ol className="list-decimal space-y-1.5 ps-5 text-neutral-300">
              <li>Open Telegram and search for <strong>@BotFather</strong> (the one with the blue check).</li>
              <li>Send <code className="rounded bg-white/10 px-1.5">/newbot</code>, then choose a name and a username that ends with <code className="rounded bg-white/10 px-1.5">bot</code>.</li>
              <li>BotFather replies with a token that looks like <code className="rounded bg-white/10 px-1.5">123456789:ABC...</code>. Copy it.</li>
              <li>Already have a bot? Send <code className="rounded bg-white/10 px-1.5">/mybots</code>, pick your bot, then API Token.</li>
            </ol>
            <p className="text-sm text-neutral-400">Treat the token like a password. We store it encrypted and only use it to connect your bot. Official guide: <a className="text-[#e5a93c] underline" href="https://core.telegram.org/bots#how-do-i-create-a-bot" target="_blank" rel="noopener noreferrer">core.telegram.org/bots</a>.</p>
          </section>

          <section className={section}>
            <h2 className="text-lg font-semibold">What happens next</h2>
            <p className="text-neutral-300">After you send your details we connect your accounts and send you an invitation. Open Instagram and Facebook, find the invitation in your notifications, and accept it. You will see a green note in your dashboard when everything is connected.</p>
            <Link href="/dashboard" className="inline-block text-sm font-semibold text-[#e5a93c] hover:underline">Back to my dashboard</Link>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  )
}
