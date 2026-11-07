import { decryptString, encryptString } from "@/lib/crypto"

/**
 * SMTP settings live in `app_settings` under `smtp_settings`.
 * The password is stored as `pass_encrypted` (AES-GCM with
 * BYOK_ENCRYPTION_SECRET). Older rows hold a plaintext `pass`; those are
 * still read so mail keeps working, and are re-sealed on the next save.
 */
export interface StoredSmtpSettings {
  host?: string
  port?: string | number
  secure?: boolean
  user?: string
  pass?: string
  pass_encrypted?: string
  fromName?: string
  fromEmail?: string
}

export function openSmtpPassword(value: StoredSmtpSettings | null | undefined): string | null {
  if (!value) return null
  if (value.pass_encrypted) return decryptString(value.pass_encrypted)
  return value.pass ? String(value.pass) : null
}

/** What the admin UI may see. The password never leaves the server. */
export function maskSmtpSettings(value: StoredSmtpSettings | null | undefined) {
  const { pass: _pass, pass_encrypted: _sealed, ...rest } = value || {}
  return { ...rest, pass: "", hasPassword: Boolean(value?.pass_encrypted || value?.pass) }
}

/**
 * Build the row to store. An empty or missing `pass` keeps the existing
 * password, so re-saving the masked form does not wipe it.
 */
export function mergeSmtpUpdate(
  existing: StoredSmtpSettings | null | undefined,
  body: Record<string, unknown>,
  seal: (plain: string) => string = encryptString,
): StoredSmtpSettings {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? undefined : String(v))
  const next: StoredSmtpSettings = {
    host: str(body.host),
    port: str(body.port),
    secure: typeof body.secure === "boolean" ? body.secure : undefined,
    user: str(body.user),
    fromName: str(body.fromName),
    fromEmail: str(body.fromEmail),
  }
  const newPass = typeof body.pass === "string" && body.pass.length > 0 ? body.pass : null
  if (newPass) {
    next.pass_encrypted = seal(newPass)
  } else if (existing?.pass_encrypted) {
    next.pass_encrypted = existing.pass_encrypted
  } else if (existing?.pass) {
    next.pass_encrypted = seal(String(existing.pass))
  }
  return next
}
