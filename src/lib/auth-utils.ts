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

/** MANAGER or ACCOUNTANT or OWNER — any authenticated user */
export async function requireManager() {
  const session = await auth();
  if (!session) {
    return { session: null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "MANAGER" && session.user.role !== "ACCOUNTANT") {
    return { session: null, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

/**
 * Returns the list of property IDs the current user may access.
 * - OWNER: only their owned properties
 * - MANAGER / ACCOUNTANT: properties explicitly granted via PropertyAccess
 *
 * Returns null if unauthenticated.
 */
export async function getAccessiblePropertyIds(): Promise<string[] | null> {
  const session = await auth();
  if (!session) return null;

  const userId = session.user.id;
  const role = session.user.role;

  if (role === "OWNER") {
    const owned = await prisma.property.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    return owned.map((p) => p.id);
  }

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
