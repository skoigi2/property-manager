/**
 * Org-role vocabulary + the pure allow-list decision. Kept free of next-auth /
 * prisma imports so it is unit-testable; auth-utils.ts re-exports everything.
 *
 * Every route helper is an ALLOW-list keyed on the active org's membership
 * role (session.user.orgRole). A role that is not named is denied — so a new
 * role (e.g. CARETAKER) reaches nothing until a route opts it in explicitly.
 */

export type OrgRole = "ADMIN" | "MANAGER" | "ACCOUNTANT" | "OWNER" | "CARETAKER";

/** Manager tier: full operational + financial access. */
export const MANAGER_ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT"] as const satisfies readonly OrgRole[];
/** Every role that existed before CARETAKER — what `requireAuth()` admits. */
export const ESTABLISHED_ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER"] as const satisfies readonly OrgRole[];
/** Operations staff: manager tier + on-site CARETAKER (expenses / maintenance / vendors). */
export const OPS_ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT", "CARETAKER"] as const satisfies readonly OrgRole[];

/** Pure decision behind requireRoles — unit-tested in role-access.test.ts. */
export function isRoleAllowed(
  orgRole: string | null | undefined,
  allowed: readonly string[],
  superAdmin: boolean,
): boolean {
  if (superAdmin) return true;
  if (!orgRole) return false;
  return allowed.includes(orgRole);
}
