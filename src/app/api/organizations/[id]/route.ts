import { requireAuth, requireSuperAdmin, getCurrentOrgId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { roleCan, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

async function canAccessOrg(orgId: string, session: { user: { id: string; role: string; organizationId: string | null } }) {
  const isSuperAdmin = session.user.role === "ADMIN" && session.user.organizationId === null;
  if (isSuperAdmin) return true;
  if (session.user.organizationId === orgId) return true;
  // Fallback 1: membership table
  const membership = await prisma.userOrganizationMembership.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId: orgId } },
  });
  if (membership) return true;
  // Fallback 2: property access (managers added via UI before memberships existed)
  const access = await prisma.propertyAccess.findFirst({
    where: { userId: session.user.id, property: { organizationId: orgId } },
  });
  return !!access;
}

// ── GET /api/organizations/[id] ───────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (!(await canAccessOrg(params.id, session!))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true, properties: true } } },
  });
  if (!org) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(org);
}

// ── PATCH /api/organizations/[id] ────────────────────────────────────────────
const updateSchema = z.object({
  name:                 z.string().min(1).optional(),
  address:              z.string().optional().nullable(),
  phone:                z.string().optional().nullable(),
  // The settings form round-trips "" for an unset email; treat it as null
  // rather than failing .email() validation (orgs with no email could never
  // save ANY branding change, including a rename).
  email:                z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable().optional()),
  website:              z.string().optional().nullable(),
  isActive:             z.boolean().optional(),
  // Invoice numbering — org default series
  invoiceFormat:        z.string().max(60).optional().nullable(),
  invoiceNextNumber:    z.coerce.number().int().min(1).optional(),
  vatRegistrationNumber: z.string().optional().nullable(),
  bankName:             z.string().optional().nullable(),
  bankAccountName:      z.string().optional().nullable(),
  bankAccountNumber:    z.string().optional().nullable(),
  bankBranch:           z.string().optional().nullable(),
  mpesaPaybill:         z.string().optional().nullable(),
  mpesaAccountNumber:   z.string().optional().nullable(),
  mpesaTill:            z.string().optional().nullable(),
  paymentInstructions:  z.string().optional().nullable(),
  freeAccess:           z.boolean().optional(), // super-admin only
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  // NOTE: deliberately requireAuth + a manual gate, NOT require*Write —
  // organizations routes are exempt from the subscription write-gate so a
  // locked org can still edit its own details (CLAUDE.md exemption list).
  const { error, session } = await requireAuth();
  if (error) return error;

  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  if (!isSuperAdmin) {
    // Gate on the caller's membership role FOR THE TARGET ORG (a multi-org
    // admin may edit an org that isn't their active one) — never the global
    // User.role, which is unrelated to what they may do in this org.
    const membership = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId: session!.user.id, organizationId: params.id } },
      select: { role: true },
    });
    const orgRole = membership?.role;
    if (!orgRole || orgRole === "OWNER" || !roleCan(orgRole, "ORG_SETTINGS")) {
      return Response.json(
        { error: orgRole ? PERMISSION_DENIED_MESSAGE.ORG_SETTINGS : "Forbidden" },
        { status: 403 },
      );
    }
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Only super-admin may toggle the freeAccess override
  if (parsed.data.freeAccess !== undefined && !isSuperAdmin) {
    return Response.json({ error: "Only super-admin can change free access" }, { status: 403 });
  }

  const before = await prisma.organization.findUnique({ where: { id: params.id } });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });

  const org = await prisma.organization.update({
    where: { id: params.id },
    data: parsed.data,
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Organization",
    resourceId: params.id,
    organizationId: params.id,
    before,
    after: parsed.data, // logAudit redacts bank/M-Pesa/VAT keys
  });

  return Response.json(org);
}

// ── DELETE /api/organizations/[id] ───────────────────────────────────────────
//
// Super-admin only. Permanently removes an organisation and everything scoped
// to it (properties, units, tenants, financials, invitations, memberships —
// all cascade at the FK level). User accounts are NOT deleted: members whose
// active org was this one are re-pointed at another org they belong to, or
// left org-less. An org-less user is never left with global role ADMIN — that
// is exactly the shape the app reads as a platform super-admin (see
// requireSuperAdmin) — so founders of a deleted org drop to the role of any
// invitation still pending for them, else MANAGER.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireSuperAdmin();
  if (error) return error;

  const org = await prisma.organization.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { properties: true, memberships: true, users: true } },
    },
  });
  if (!org) return Response.json({ error: "Organisation not found." }, { status: 404 });

  // Every user whose ACTIVE org is the one being deleted
  const activeHere = await prisma.user.findMany({
    where:  { organizationId: org.id },
    select: {
      id: true, email: true, role: true,
      organizationMemberships: {
        where:   { organizationId: { not: org.id } },
        orderBy: { createdAt: "asc" },
        take:    1,
        select:  { organizationId: true },
      },
    },
  });

  // Sequential awaits by design — callback-form $transaction is pgBouncer-
  // incompatible. Each step is idempotent, so a retry after a failure is safe.
  for (const u of activeHere) {
    const fallbackOrg = u.organizationMemberships[0]?.organizationId ?? null;
    let role = u.role;
    if (!fallbackOrg && u.role === "ADMIN") {
      const pending = u.email
        ? await prisma.orgInvitation.findFirst({
            where:   { email: u.email.toLowerCase(), acceptedAt: null, expiresAt: { gt: new Date() }, status: "SENT" },
            orderBy: { createdAt: "desc" },
            select:  { role: true },
          })
        : null;
      role = pending?.role ?? "MANAGER";
    }
    await prisma.user.update({
      where: { id: u.id },
      data:  { organizationId: fallbackOrg, role },
    });
  }

  await prisma.organization.delete({ where: { id: org.id } });

  await logAudit({
    userId:         session!.user.id,
    userEmail:      session!.user.email,
    action:         "DELETE",
    resource:       "Organization",
    resourceId:     org.id,
    organizationId: org.id,
    before: {
      name:        org.name,
      pricingTier: org.pricingTier,
      properties:  org._count.properties,
      members:     org._count.memberships,
      detachedUsers: activeHere.map((u) => u.email),
    },
  });

  return Response.json({
    ok: true,
    deleted: { id: org.id, name: org.name },
    detachedUsers: activeHere.length,
  });
}
