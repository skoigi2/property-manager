import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

export async function getSession() {
  return await auth();
}

/** True when the session belongs to the platform super-admin (no org). */
function isSuperAdmin(session: Session | null): boolean {
  if (!session) return false;
  return session.user.role === "ADMIN" && session.user.organizationId === null;
}

export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

/** Platform super-admin: global role=ADMIN AND organizationId=null */
export async function requireSuperAdmin() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isSuperAdmin(session)) {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

/**
 * Any ADMIN (org-level or super-admin).
 * Uses orgRole so a user who is ADMIN in one org but MANAGER in another is
 * correctly checked against their active org's role.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // Super-admin always passes
  if (isSuperAdmin(session)) return { session, error: null };
  // Org-level: check the membership role for the active org
  if (session.user.orgRole !== "ADMIN") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

/** ADMIN, MANAGER, or ACCOUNTANT (not OWNER) for the active org. */
export async function requireManager() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (isSuperAdmin(session)) return { session, error: null };
  if (session.user.orgRole === "OWNER") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

/**
 * Only the billing owner of the active org (or platform super-admin).
 * Use for routes that mutate subscription/billing state.
 */
export async function requireBillingOwner() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (isSuperAdmin(session)) return { session, error: null };
  if (!session.user.isBillingOwner) {
    return {
      session: null,
      error: Response.json(
        { error: "Only the billing owner can perform this action." },
        { status: 403 }
      ),
    };
  }
  return { session, error: null };
}

/** Returns the current user's organizationId (null = super-admin, undefined = unauthenticated) */
export async function getCurrentOrgId(): Promise<string | null | undefined> {
  const session = await auth();
  if (!session) return undefined;
  return session.user.organizationId;
}

/**
 * Returns property IDs the current user may access, scoped by organization.
 *
 * - Super-admin (role=ADMIN, organizationId=null): ALL properties across all orgs
 * - Org-admin  (orgRole=ADMIN, organizationId=X):  all properties in their org
 * - OWNER:      their owned properties
 * - MANAGER / ACCOUNTANT: PropertyAccess grants only
 *
 * Returns null if unauthenticated.
 */
export async function getAccessiblePropertyIds(): Promise<string[] | null> {
  const session = await auth();
  if (!session) return null;

  const userId = session.user.id;
  const orgId  = session.user.organizationId;

  // Platform super-admin — full access across all orgs
  if (isSuperAdmin(session)) {
    const all = await prisma.property.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  // Use orgRole (per-org) for all org-scoped checks
  const orgRole = session.user.orgRole;

  // Org-level admin — all properties within their org
  if (orgRole === "ADMIN" && orgId) {
    const all = await prisma.property.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    return all.map((p) => p.id);
  }

  if (orgRole === "OWNER") {
    const owned = await prisma.property.findMany({
      where: {
        ownerId: userId,
        ...(orgId ? { organizationId: orgId } : {}),
      },
      select: { id: true },
    });
    return owned.map((p) => p.id);
  }

  // MANAGER / ACCOUNTANT — explicit PropertyAccess grants, scoped to active org
  const access = await prisma.propertyAccess.findMany({
    where: {
      userId,
      ...(orgId ? { property: { organizationId: orgId } } : {}),
    },
    select: { propertyId: true },
  });
  return access.map((a) => a.propertyId);
}

/**
 * Verifies the current user may access a specific property.
 * Returns { ok: true } or { ok: false, error: Response }.
 */
export async function requirePropertyAccess(
  propertyId: string
): Promise<{ ok: boolean; error?: Response }> {
  const ids = await getAccessiblePropertyIds();
  if (ids === null) {
    return { ok: false, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!ids.includes(propertyId)) {
    return { ok: false, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true };
}
