import { NextRequest, NextResponse } from "next/server";
import { getSupabaseBypassClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email-provider";
import { BRAND } from "@/lib/brand";
import { clientIpFromHeaders, escapeHtml, takeRateSlots } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,189}\.[^\s@<>"']{2,}$/;

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, name } = await request.json();

    const email = typeof rawEmail === "string" ? rawEmail.toLowerCase().trim() : "";
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const supabase = await getSupabaseBypassClient();
    const normalizedName = (typeof name === "string" && name.trim()) ? name.trim().slice(0, 80) : null;

    // Unauthenticated endpoint that sends mail from the platform's SMTP
    // account: cap it per IP, per address and globally.
    const ip = clientIpFromHeaders(request.headers);
    const ipAllowed = await takeRateSlots(supabase, [
      { key: `abuse:newsletter:ip:${ip}`, limit: 5, windowSeconds: 3600 },
    ]);
    if (!ipAllowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    // Insert into newsletter_subscribers, update name if already exists
    const { error } = await supabase
      .from("newsletter_subscribers")
      .upsert(
        { email, name: normalizedName },
        { onConflict: "email" }
      );

    if (error) {
      console.error("[api/newsletter/subscribe] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Send welcome email with personalization
    const greeting = normalizedName ? `Hey ${escapeHtml(normalizedName)},` : "Hey there,";
    const subject = `Welcome to ${BRAND.name}!`;
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#03010A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <center style="width:100%;background-color:#03010A;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:auto;">
            <!-- Header -->
            <tr>
              <td style="padding:40px 20px 20px;text-align:center;">
                <a href="${BRAND.appUrl}" style="text-decoration:none;">
                  <img src="${BRAND.appUrl}${BRAND.logo.wordmarkDark}" alt="${BRAND.name}" width="140" style="display:inline-block;border:0;outline:none;" />
                </a>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="background-color:#0d0b14;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 30px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="font-size:26px;line-height:34px;color:#ffffff;font-weight:bold;padding-bottom:16px;">
                      You're Subscribed! 🎉
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:18px;line-height:26px;color:#d4d4d4;padding-bottom:16px;">
                      ${greeting}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:16px;line-height:26px;color:#a1a1aa;padding-bottom:24px;">
                      Thank you for joining the ${BRAND.name} community. You'll receive updates on product news, new features, and tips to level up your automation workflows.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:10px;padding-bottom:10px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="border-radius:8px;background:#e5a93c;text-align:center;">
                            <a href="${BRAND.appUrl}/dashboard" style="background:#e5a93c;border:1px solid #e5a93c;font-size:15px;text-decoration:none;padding:14px 28px;color:#000000;display:block;border-radius:8px;font-weight:700;">Start Building Now</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:40px 20px;font-size:13px;line-height:20px;color:#71717a;text-align:center;">
                <p style="margin:0 0 10px 0;">© ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
                <p style="margin:0;">
                  <a href="${BRAND.appUrl}" style="color:#71717a;text-decoration:underline;">${BRAND.short}</a>
                  &nbsp;•&nbsp;
                  <a href="${BRAND.appUrl}/unsubscribe" style="color:#71717a;text-decoration:underline;">Unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </center>
      </body>
      </html>
    `;

    const mayEmail = await takeRateSlots(supabase, [
      { key: `abuse:newsletter:to:${email}`, limit: 1, windowSeconds: 86400 },
      { key: "abuse:newsletter:global", limit: 200, windowSeconds: 3600 },
    ]);
    if (!mayEmail) {
      return NextResponse.json({ ok: true, message: "Subscribed successfully" });
    }

    await sendEmail({
      to: email,
      subject,
      html,
    }).catch(err => {
      console.error("[api/newsletter/subscribe] Welcome email failed to send:", err);
    });

    return NextResponse.json({ ok: true, message: "Subscribed successfully" });
  } catch (error) {
    console.error("[api/newsletter/subscribe] Server error:", error);
    return NextResponse.json({ error: "Something went wrong subscribing. Please try again." }, { status: 500 });
  }
}
