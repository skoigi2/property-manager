import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { sendOrgInvitation } from "@/lib/email";
import { canAddUser } from "@/lib/subscription";
import { roleOutranksCaller } from "@/lib/permissions";
import { z } from "zod";
import { randomUUID } from "crypto";

const createSchema = z.object({
  email: z.string().email(),
  role:  z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER"]),
});

/**
 * POST /api/invitations
 * Create and send an org invitation. Requires ADMIN role in the active org.
 */
export async function POST(req: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    return Response.json({ error: "Super-admin must specify an org context." }, { status: 400 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, role } = parsed.data;

  // Role escalation guard: cannot invite someone with a higher role than your own
  if (roleOutranksCaller(role, session!.user.orgRole)) {
    return Response.json(
      { error: "You cannot invite someone with a higher role than your own." },
      { status: 403 }
    );
  }

  // Team-member cap per tier — invitations count toward the same limit as
  // directly-created accounts (TEAM_LIMITS in paddle.ts). NOTE: invitations
  // are exempt from the subscription write-gate (CLAUDE.md); the team cap is
  // orthogonal to the org's lock state.
  const capacityOk = await canAddUser(orgId);
  if (!capacityOk) {
    return Response.json(
      { error: "Team-member limit reached for your plan. Upgrade to add more.", code: "TEAM_LIMIT_REACHED" },
      { status: 402 },
    );
  }

  // Check not already a member
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  if (existingUser) {
    const existingMembership = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId: orgId } },
    });
    if (existingMembership) {
      return Response.json({ error: "This user is already a member of the organisation." }, { status: 409 });
    }
  }

  // Check no pending invite for this email+org
  const pendingInvite = await prisma.orgInvitation.findFirst({
    where: {
      email:          email.toLowerCase(),
      organizationId: orgId,
      acceptedAt:     null,
      expiresAt:      { gt: new Date() },
    },
  });
  if (pendingInvite) {
    return Response.json({ error: "A pending invitation already exists for this email." }, { status: 409 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  const token     = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  const invitation = await prisma.orgInvitation.create({
    data: {
      email:          email.toLowerCase(),
      role,
      organizationId: orgId,
      invitedByUserId: session!.user.id,
      token,
      expiresAt,
    },
  });

  const baseUrl   = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
  const acceptUrl = `${baseUrl}/invite/${token}`;

  // Fire-and-forget
  sendOrgInvitation(
    email,
    session!.user.name ?? session!.user.email ?? "A team member",
    org?.name ?? "your organisation",
    role,
    acceptUrl,
    expiresAt,
    { organizationId: orgId }, // org-scope the EmailLog row
  ).catch(console.error);

  return Response.json({ ok: true, invitationId: invitation.id }, { status: 201 });
}

/**
 * GET /api/invitations
 * List pending invitations for the caller's org (admin only).
 */
export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json([], { status: 200 });

  const invitations = await prisma.orgInvitation.findMany({
    // Only live invitations — expired ones are dead tokens, not "pending"
    where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(invitations);
}
