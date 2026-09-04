import type { Prisma } from "@prisma/client";

/**
 * Who counts as "a manager of this property" for notifications and
 * auto-assignment — the single predicate every recipient lookup uses.
 *
 * Keyed on the org MEMBERSHIP role (UserOrganizationMembership.role), never
 * the global User.role: the invitation flow only writes the membership, so an
 * invited org admin keeps a global role of MANAGER and used to be notified
 * only for properties they held a PropertyAccess grant on.
 *
 * - org ADMIN members: every property in the org
 * - org MANAGER members: only properties they have PropertyAccess to
 * - ACCOUNTANT / OWNER / CARETAKER: never
 */
export function propertyManagerWhere(propertyId: string, organizationId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    email: { not: null },
    OR: [
      { organizationMemberships: { some: { organizationId, role: "ADMIN" } } },
      {
        organizationMemberships: { some: { organizationId, role: "MANAGER" } },
        propertyAccess: { some: { propertyId } },
      },
    ],
  };
}

/** Org admins only (membership role) — e.g. "a manager requested an invite". */
export function orgAdminWhere(organizationId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    email: { not: null },
    organizationMemberships: { some: { organizationId, role: "ADMIN" } },
  };
}
