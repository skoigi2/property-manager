import { prisma } from "@/lib/prisma";

/**
 * Guest records (AirbnbGuest) have no property link of their own, so they are
 * scoped purely by owning organisation. This helper resolves a guest's org and
 * decides whether the current session may touch it.
 *
 * Rules (mirroring the ExpenseEntry / PettyCash PORTFOLIO pattern):
 * - Missing guest → 404.
 * - Another org's guest → 404 (looks nonexistent, never 403).
 * - Legacy null-org guests are grandfathered visible.
 * - Super-admin (sessionOrgId null) sees everything.
 *
 * Returns `{ error: Response }` to short-circuit the handler, or
 * `{ error: null, organizationId }` when access is allowed.
 */
export async function assertGuestAccess(
  guestId: string,
  sessionOrgId: string | null | undefined,
): Promise<{ error: Response } | { error: null; organizationId: string | null }> {
  const guest = await prisma.airbnbGuest.findUnique({
    where: { id: guestId },
    select: { organizationId: true },
  });
  if (!guest) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  if (guest.organizationId && sessionOrgId && guest.organizationId !== sessionOrgId) {
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  }
  return { error: null, organizationId: guest.organizationId };
}

/**
 * Prisma `where` fragment scoping a guest list to the caller's organisation.
 * Legacy null-org guests stay visible; super-admin (null org) gets no filter.
 */
export function guestOrgScope(sessionOrgId: string | null | undefined) {
  if (!sessionOrgId) return {}; // super-admin: all orgs
  return { OR: [{ organizationId: sessionOrgId }, { organizationId: null }] };
}
