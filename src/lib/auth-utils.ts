import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveSubscription } from "@/lib/subscription";
import { roleCan, PERMISSION_DENIED_MESSAGE, type PermissionAction } from "@/lib/permissions";
import { cookies } from "next/headers";
import type { Session } from "next-auth";

/**
 * Cookie set by the super-admin header org filter. Narrows the super-admin's
 * LIST scope (getAccessiblePropertyIds) to one organisation so every page
 * renders as if viewing that org. It never narrows AUTHORITY —
 * requirePropertyAccess stays cross-org for super-admin so the admin tooling
 * (property moves, org management) keeps working while a filter is active.
 * Client-set and therefore untrusted — it can only ever NARROW the
 * super-admin's own view, and is ignored for every other role.
 */
const SUPER_ORG_FILTER_COOKIE = "gw-super-org-filter";

function superAdminOrgFilter(): string | null {
  try {
    return cookies().get(SUPER_ORG_FILTER_COOKIE)?.value || null;
  } catch {
    return null; // outside a request scope (e.g. cron) — no filter
  }
}

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

// ─── Write-gated variants ─────────────────────────────────────────────────────
// Use these at the top of every mutating handler (POST/PATCH/PUT/DELETE) on
// org-scoped resources. They run the same auth check as their base helper,
// then return a 402 Response when the org's subscription is locked (trial
// expired, past_due, canceled). Read handlers keep using the base helpers so
// locked orgs can still see their data.

async function withActiveSubscription(result: {
  session: Session | null;
  error: Response | null;
}): Promise<{ session: Session | null; error: Response | null }> {
  if (result.error || !result.session) return result;
  const locked = await requireActiveSubscription(result.session.user.organizationId);
  if (locked) return { session: null, error: locked };
  return result;
}

/** requireAuth + subscription write-gate. */
export async function requireAuthWrite() {
  return withActiveSubscription(await requireAuth());
}

/** requireManager + subscription write-gate. */
export async function requireManagerWrite() {
  return withActiveSubscription(await requireManager());
}

/** requireAdmin + subscription write-gate. */
export async function requireAdminWrite() {
  return withActiveSubscription(await requireAdmin());
}

/**
 * requireManagerWrite + granular role permission (see src/lib/permissions.ts).
 * Use for mutations that ACCOUNTANT (or future restricted roles) must not
 * perform — e.g. deleting financial records, tenancy lifecycle changes.
 */
export async function requirePermissionWrite(action: PermissionAction) {
  const result = await requireManagerWrite();
  if (result.error || !result.session) return result;
  if (!roleCan(result.session.user.orgRole, action)) {
    return {
      session: null,
      error: Response.json(
        { error: PERMISSION_DENIED_MESSAGE[action], code: "PERMISSION_DENIED" },
        { status: 403 }
      ),
    };
  }
  return result;
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
 * Thin wrapper over {@link getAccessiblePropertyIdsForUser} that sources the
 * user from the active session. Returns null if unauthenticated.
 */
export async function getAccessiblePropertyIds(): Promise<string[] | null> {
  const session = await auth();
  if (!session) return null;
  // Super-admin viewing scope: the header org filter narrows every listing
  // to one organisation's properties (see SUPER_ORG_FILTER_COOKIE above).
  if (isSuperAdmin(session)) {
    const filter = superAdminOrgFilter();
    if (filter) {
      const props = await prisma.property.findMany({
        where: { organizationId: filter },
        select: { id: true },
      });
      return props.map((p) => p.id);
    }
  }
  return resolveAccessiblePropertyIds({
    userId:  session.user.id,
    orgId:   session.user.organizationId,
    role:    session.user.role,
    orgRole: session.user.orgRole,
  });
}

/**
 * Session-less variant: resolves the same access scope from a user id alone,
 * re-deriving `orgRole` from the user's membership in their active org exactly
 * as the JWT callback does (`membership?.role ?? user.role`).
 *
 * Used by surfaces that authenticate with their own token instead of a session
 * (e.g. the calendar ICS feed), so OWNER / manager scoping stays identical
 * across both paths. Returns null when the user no longer exists.
 */
export async function getAccessiblePropertyIdsForUser(
  userId: string
): Promise<string[] | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, organizationId: true },
  });
  if (!user) return null;

  const membership = user.organizationId
    ? await prisma.userOrganizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: user.organizationId,
          },
        },
        select: { role: true },
      })
    : null;

  return resolveAccessiblePropertyIds({
    userId:  user.id,
    orgId:   user.organizationId ?? null,
    role:    user.role,
    orgRole: membership?.role ?? user.role,
  });
}

/**
 * Shared scope resolution — the single source of truth for "which properties
 * may this user see".
 *
 * - Super-admin (role=ADMIN, organizationId=null): ALL properties across all orgs
 * - Org-admin  (orgRole=ADMIN, organizationId=X):  all properties in their org
 * - OWNER:      their owned properties
 * - MANAGER / ACCOUNTANT: PropertyAccess grants only
 */
async function resolveAccessiblePropertyIds(actor: {
  userId: string;
  orgId: string | null;
  role: string;
  orgRole: string;
}): Promise<string[]> {
  const { userId, orgId, role, orgRole } = actor;

  // Platform super-admin — full access across all orgs
  if (role === "ADMIN" && orgId === null) {
    const all = await prisma.property.findMany({ select: { id: true } });
    return all.map((p) => p.id);
  }

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

  // MANAGER / ACCOUNTANT — explicit PropertyAccess grants only, scoped to active org.
  // No "fall back to all org properties" — that silently grants full visibility to a
  // manager whose PropertyAccess rows are missing (deletion bug, race during onboarding,
  // accidental cleanup). Org-admins (handled above) keep all-org access; regular managers
  // must be granted explicit access via PropertyAccess.
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
  const session = await auth();
  if (!session) {
    return { ok: false, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // Super-admin may act on ANY property — deliberately NOT narrowed by the
  // header org filter (that filter scopes listings, not authority; the
  // Organisations admin page operates cross-org regardless of it).
  if (isSuperAdmin(session)) {
    const exists = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!exists) return { ok: false, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
    return { ok: true };
  }
  const ids = await getAccessiblePropertyIds();
  if (ids === null) {
    return { ok: false, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!ids.includes(propertyId)) {
    return { ok: false, error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true };
}
