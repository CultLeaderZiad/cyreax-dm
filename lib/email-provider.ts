import { captureException } from "./monitoring";
import { getSupabaseBypassClient } from "./supabase-server";
import nodemailer from "nodemailer";
import { BRAND } from "./brand";
import { openSmtpPassword } from "./smtp-settings";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  fromName,
  fromEmail,
}: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const supabase = await getSupabaseBypassClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "smtp_settings")
      .maybeSingle();

    if (error || !data || !data.value) {
      console.error("[email-provider] Missing SMTP configuration in app_settings.");
      // Login, receipt and reset emails all depend on this: alert, don't just log.
      void captureException(new Error("SMTP is not configured; email not sent"), { area: "email" });
      return { success: false, error: "Missing SMTP configuration. Please configure it in the Admin Dashboard." };
    }

    const { host, port, secure, user, fromName: defaultFromName, fromEmail: defaultFromEmail } = data.value;
    const pass = openSmtpPassword(data.value);

    if (!host || !port || !user || !pass) {
      void captureException(new Error("SMTP configuration is incomplete; email not sent"), { area: "email" });
      return { success: false, error: "Incomplete SMTP configuration." };
    }

    const finalFromName = fromName || defaultFromName || BRAND.name;
    const finalFromEmail = fromEmail || defaultFromEmail || user;
    const finalReplyTo = replyTo || finalFromEmail;

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: secure ?? (Number(port) === 465), 
      auth: {
        user,
        pass,
      },
    });

    const info = await transporter.sendMail({
      from: `"${finalFromName}" <${finalFromEmail}>`,
      to,
      subject,
      html,
      replyTo: finalReplyTo,
      headers: {
        "List-Unsubscribe": `<mailto:${finalFromEmail}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Precedence": "bulk",
        "X-Mailer": `${BRAND.slug}-mailer/1.0`,
      },
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[email-provider] Nodemailer error:", error);
    return { success: false, error: error.message || "Unknown error sending email" };
  }
}
