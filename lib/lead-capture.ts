import { SupabaseClient } from "@supabase/supabase-js"
import { sendTextDM } from "./instagram-api"
import { botLocale, botText } from "./bot-copy"

type LeadSender = (
  token: string,
  recipient: { id?: string; comment_id?: string },
  text: string,
) => Promise<unknown>

export interface LeadCaptureResult {
  shouldContinue: boolean
  replyTextLog?: string
  lead?: { email?: string | null; phone?: string | null; name?: string | null }
}

export async function processLeadCapture(
  supabase: SupabaseClient,
  userId: string,
  senderId: string,
  realUsername: string,
  accessToken: string,
  triggerValue: string,
  automation: any,
  parsedContent: any,
  commentId?: string,
  options?: { sendText?: LeadSender; locale?: "en" | "ar" },
) {
  // 1. Fetch current conversation state
  const { data: leadState } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("user_id", userId)
    .eq("ig_user_id", senderId)
    .single()

  let currentState = leadState

  // If no state exists but the automation requires lead capture
  if (!currentState && parsedContent.lead_capture) {
    const lc = parsedContent.lead_capture
    let nextStep = ""
    if (lc.require_name) nextStep = "ask_name"
    else if (lc.require_phone) nextStep = "ask_phone"
    else if (lc.require_email) nextStep = "ask_email"

    if (nextStep) {
      // Start the sequence
      const { data } = await supabase.from("conversation_state").insert({
        user_id: userId,
        ig_user_id: senderId,
        automation_id: automation.id,
        current_step: nextStep,
        data: {}
      }).select().single()
      
      currentState = data
    }
  }

  // If still no state, no lead capture needed
  if (!currentState) {
    return { shouldContinue: true } // proceed to deliver payload
  }

  // 2. Process current step if user replied
  let stateData = { ...currentState.data }
  let currentStep = currentState.current_step
  let justStarted = !leadState // If we just created the state, don't process their triggerValue as the answer

  if (!justStarted) {
    // Process their answer
    if (currentStep === "ask_email") stateData.email = triggerValue
    else if (currentStep === "ask_phone") stateData.phone = triggerValue
    else if (currentStep === "ask_name") stateData.name = triggerValue

    // Determine next step
    const lc = parsedContent.lead_capture || {}
    let nextStep = ""
    if (lc.require_name && !stateData.name) nextStep = "ask_name"
    else if (lc.require_phone && !stateData.phone) nextStep = "ask_phone"
    else if (lc.require_email && !stateData.email) nextStep = "ask_email"

    currentStep = nextStep

    // Update state in DB
    if (currentStep) {
      await supabase.from("conversation_state").update({
        current_step: currentStep,
        data: stateData
      }).eq("id", currentState.id)
    } else {
      // Sequence finished!
      // 1. Save to leads table
      await supabase.from("leads").upsert({
        user_id: userId,
        ig_user_id: senderId,
        ig_username: realUsername,
        email: stateData.email || null,
        phone: stateData.phone || null,
        name: stateData.name || null,
      }, { onConflict: "user_id,ig_user_id" })

      await supabase.from("conversation_state").delete().eq("id", currentState.id)

      return {
        shouldContinue: true,
        lead: {
          email: stateData.email || null,
          phone: stateData.phone || null,
          name: stateData.name || null,
        },
      }
    }
  }

  // 3. Prompt user for current step
  const locale = botLocale(options?.locale)
  let promptText = ""
  if (currentStep === "ask_email") promptText = botText(locale, "leadEmail")
  else if (currentStep === "ask_phone") promptText = botText(locale, "leadPhone")
  else if (currentStep === "ask_name") promptText = botText(locale, "leadName")

  if (promptText) {
    const recipient = justStarted && commentId ? { comment_id: commentId } : { id: senderId }
    const sendText = options?.sendText || sendTextDM
    await sendText(accessToken, recipient, promptText)
    return { shouldContinue: false, replyTextLog: `[Lead Capture] ${promptText}` }
  }

  return { shouldContinue: true }
}
