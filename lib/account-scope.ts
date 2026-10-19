import { roleAllows, type WorkspaceRole } from "@/lib/workspace-access"

export interface AccountScopeMembership {
  ownerAccountId: string
  role: WorkspaceRole
}

export type AccountScopeMethod = "GET" | "PATCH"

/**
 * Account id for agent settings.
 * The signed-in account is always in scope. A different id is accepted only
 * when that account owns a workspace the caller belongs to (read: any member,
 * write: member or above). A client-supplied id is never trusted by itself.
 * Returns null when the requested account is not allowed.
 */
export function scopedAccountId(
  sessionAccountId: string,
  requestedAccountId: string | null | undefined,
  memberships: AccountScopeMembership[] | null,
  method: AccountScopeMethod,
): string | null {
  if (!sessionAccountId) return null
  const requested = typeof requestedAccountId === "string" ? requestedAccountId.trim() : ""
  if (!requested || requested === sessionAccountId) return sessionAccountId
  if (!memberships) return null
  const minimum: WorkspaceRole = method === "PATCH" ? "member" : "client-viewer"
  const allowed = memberships.some(
    (membership) => membership.ownerAccountId === requested && roleAllows(membership.role, minimum),
  )
  return allowed ? requested : null
}
