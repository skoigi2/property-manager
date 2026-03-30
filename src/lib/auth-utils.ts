import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

/** Platform super-admin: role=ADMIN AND organizationId=null */
export async function requireSuperAdmin() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN" || session.user.organizationId !== null) {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

/** Any ADMIN (org-level or super-admin) */
export async function requireAdmin() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

/** ADMIN, MANAGER, or ACCOUNTANT (not OWNER) */
export async function requireManager() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role === "OWNER") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
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
 * - Org-admin  (role=ADMIN, organizationId=X):    all properties in their org
 * - OWNER:      their owned properties
 * - MANAGER / ACCOUNTANT: PropertyAccess grants only
 *
 * Returns null if unauthenticated.
 */
export async function getAccessiblePropertyIds(): Promise<string[] | null> {
  const session = await auth();
  if (!session) return null;

  const userId = session.user.id;
  const role = session.user.role;
  const orgId = session.user.organizationId;

  // Platform super-admin — full access across all orgs
  if (role === "ADMIN" && orgId === null) {
    const all = await prisma.property.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

  // Org-level admin — all properties within their org
  if (role === "ADMIN" && orgId) {
    const all = await prisma.property.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    return all.map((p) => p.id);
  }

  if (role === "OWNER") {
    const owned = await prisma.property.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    return owned.map((p) => p.id);
  }

  // MANAGER / ACCOUNTANT — explicit PropertyAccess grants
  const access = await prisma.propertyAccess.findMany({
    where: { userId },
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
