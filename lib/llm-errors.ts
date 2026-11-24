/** A pinned model id the provider no longer serves (retired or renamed). */
export function isModelGone(status: number, body: string): boolean {
  return status === 404 || /model_not_found|does not exist|no longer available|is not found|decommissioned/i.test(body)
}
