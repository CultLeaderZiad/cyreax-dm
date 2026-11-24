"use client"

import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FrontBackground } from "@/components/layout/FrontBackground"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const FAQ_ITEMS_EN = [
  {
    q: "What does CYREAX DM do?",
    a: "CYREAX DM is an automation engine for Instagram and Facebook. It allows you to automatically reply to DMs, comments, and story mentions using custom rules, keyword triggers, follow gates, or brand-trained AI responses."
  },
  {
    q: "How does the trial work?",
    a: "When you sign up, you automatically receive a free trial period. During this time, you have full access to test the automations. Once the trial expires, automations will pause until you upgrade to a paid plan."
  },
  {
    q: "How does billing work?",
    a: "We offer two main payment methods:\n\n• Vodafone Cash: A payment option for users in Egypt. Transfer to our business wallet number, submit your transaction reference number, and our team will review and approve your payment to activate your plan.\n• Email Payment Request: Request an official invoice and payment instructions sent directly to your email address."
  },
  {
    q: "What happens if my payment isn't renewed?",
    a: "If your subscription expires without a renewal or approved payment submission, your account will transition to an 'expired' state. Your data will be preserved, but your automations will stop firing until you renew."
  },
  {
    q: "Which platforms are supported?",
    a: "Currently, CYREAX DM supports Instagram Professional accounts and Facebook Pages (including Messenger). Telegram and WhatsApp integrations are also available for connected workflows."
  }
]

const FAQ_ITEMS_AR = [
  {
    q: "ما هي وظيفة منصة CYREAX DM؟",
    a: "CYREAX DM هي محرك أتمتة مدعوم بالذكاء الاصطناعي لحسابات انستغرام وفيسبوك. تتيح لك الرد التلقائي على الرسائل المباشرة والتعليقات وتفاعلات القصص باستخدام قواعد مخصصة، أو مشغلات الكلمات المفتاحية، أو قفل المتابعة، أو ردود الذكاء الاصطناعي الذكية."
  },
  {
    q: "كيف تعمل الفترة التجريبية المجانية؟",
    a: "بمجرد إنشاء حسابك، تحصل تلقائياً على فترة تجريبية مجانية تمنحك صلاحية كاملة لاختبار جميع ميزات الأتمتة. بعد انتهاء الفترة، تتوقف الأتمتة مؤقتاً حتى تقوم بالترقية إلى خطة مدفوعة."
  },
  {
    q: "كيف تتم عملية الدفع والاشتراك؟",
    a: "نوفر وسيلتين رئيسيتين للدفع:\n\n• فودافون كاش: وسيلة دفع محلية للمستخدمين داخل مصر، حيث يمكنك إرسال رقم مرجع التحويل ليقوم فريقنا بمراجعته وتفعيل خطتك مباشرة.\n• طلب دفع عبر البريد الإلكتروني: يمكنك طلب فاتورة رسمية وتفاصيل الدفع لتصلك مباشرة على بريدك الإلكتروني لإتمام التحويل."
  },
  {
    q: "ماذا يحدث إذا لم يتم تجديد اشتراكي؟",
    a: "في حال عدم التجديد، يتحول حسابك إلى حالة 'منتهي الصلاحية'. ستبقى بياناتك وسجلاتك محفوظة بالكامل، ولكن ستتوقف الأتمتة عن الرد حتى يتم تجديد الاشتراك."
  },
  {
    q: "ما هي المنصات الاجتماعية المدعومة؟",
    a: "تدعم المنصة حالياً حسابات انستغرام الاحترافية وصفحات فيسبوك مع مسنجر، بالإضافة إلى إمكانية الربط مع تيليجرام وواتساب لتدفقات العمل المتقدمة."
  }
]

export default function FAQPage() {
  const { language } = useLanguage()
  const isAr = language === "ar"
  const items = isAr ? FAQ_ITEMS_AR : FAQ_ITEMS_EN

  return (
    <div className="min-h-screen text-white flex flex-col justify-between selection:bg-[#e5a93c] selection:text-black relative">
      <FrontBackground />
      <div>
        <Header activeHref="/faq" />
        <main id="main-content" className="max-w-3xl mx-auto px-4 pt-12 pb-24 space-y-10 relative z-10">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono-ui text-neutral-400 hover:text-[#e5a93c] transition-colors mb-6"
            >
              <ArrowLeft className={`w-3.5 h-3.5 ${isAr ? "rotate-180" : ""}`} />
              <span>{isAr ? "العودة للرئيسية" : "Back to Home"}</span>
            </Link>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">
              {isAr ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
            </h1>
            <p className="text-neutral-400 text-base mt-2">
              {isAr
                ? "كل ما تحتاج معرفته عن منصة CYREAX DM وكيف تساعدك في تنمية تفاعل حساباتك."
                : "Everything you need to know about CYREAX DM and how it powers your social growth."}
            </p>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <details
                key={i}
                className="group border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors overflow-hidden [&_summary]:cursor-pointer"
              >
                <summary className="flex items-center justify-between px-6 py-4 text-base sm:text-lg font-medium text-white list-none [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="text-[#e5a93c] group-open:rotate-45 transition-transform duration-200 text-xl font-mono">+</span>
                </summary>
                <div className="px-6 pb-5 text-neutral-300 text-sm leading-relaxed whitespace-pre-line border-t border-white/5 pt-3">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
