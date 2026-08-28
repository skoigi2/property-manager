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
