import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { sendOrgInvitation, sendNotificationEmail, esc } from "@/lib/email";
import { canAddUser } from "@/lib/subscription";
import { roleOutranksCaller } from "@/lib/permissions";
import { z } from "zod";
import { randomUUID } from "crypto";

const createSchema = z.object({
  email: z.string().email(),
  role:  z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER", "CARETAKER"]),
  // Property scope granted on acceptance (MANAGER/ACCOUNTANT/CARETAKER invitees).
  // Empty/absent = all org properties (CARETAKER must be explicit).
  propertyIds: z.array(z.string()).optional(),
});

/**
 * POST /api/invitations
 * ADMIN: create and email an org invitation immediately (status SENT).
 * MANAGER: create a REQUESTED row — an admin must approve before the
 * invitation is emailed; scope is limited to the manager's own properties.
 */
export async function POST(req: Request) {
  const { error, session } = await requireManager();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    return Response.json({ error: "Super-admin must specify an org context." }, { status: 400 });
  }

  const callerRole = session!.user.orgRole;
  const isOrgAdmin = callerRole === "ADMIN" || (session!.user.role === "ADMIN" && !session!.user.orgRole);
  if (!isOrgAdmin && callerRole !== "MANAGER") {
    return Response.json({ error: "Only admins and managers can add team members." }, { status: 403 });
  }
  const isRequest = !isOrgAdmin; // MANAGER path — needs admin approval

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

  // Property scope only applies to MANAGER/ACCOUNTANT invitees, and every id
  // must be a property THIS caller can access (an admin sees the whole org; a
  // manager only their own properties — which is exactly the request limit).
  const isPropertyScopedRole = role === "MANAGER" || role === "ACCOUNTANT" || role === "CARETAKER";
  let propertyIds = isPropertyScopedRole ? (parsed.data.propertyIds ?? []) : [];
  // On-site staff are property-scoped by definition — never "all org properties".
  if (role === "CARETAKER" && propertyIds.length === 0) {
    return Response.json({ error: "Select at least one property for a caretaker." }, { status: 400 });
  }
  if (propertyIds.length > 0) {
    const accessible = new Set((await getAccessiblePropertyIds()) ?? []);
    if (propertyIds.some((id) => !accessible.has(id))) {
      return Response.json({ error: "One or more properties are outside your access." }, { status: 403 });
    }
    propertyIds = Array.from(new Set(propertyIds));
  } else if (isRequest) {
    // A manager's request must carry an explicit scope — "all org properties"
    // would exceed what they can grant.
    return Response.json({ error: "Select at least one property for the request." }, { status: 400 });
  }

  // Team-member cap per tier — invitations count toward the same limit as
  // directly-created accounts (TEAM_LIMITS in paddle.ts). NOTE: invitations
  // are exempt from the subscription write-gate (CLAUDE.md); the team cap is
  // orthogonal to the org's lock state. Manager REQUESTS skip this — the cap
  // is enforced when an admin approves (and again at acceptance).
  if (!isRequest) {
    const capacityOk = await canAddUser(orgId, role);
    if (!capacityOk) {
      return Response.json(
        { error: role === "CARETAKER" ? "Caretaker-seat limit reached for your plan. Upgrade to add more." : "Team-member limit reached for your plan. Upgrade to add more.", code: "TEAM_LIMIT_REACHED" },
        { status: 402 },
      );
    }
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
      status: isRequest ? "REQUESTED" : "SENT",
      propertyIds,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";

  if (isRequest) {
    // Notify the org's admins that a request is waiting (fire-and-forget)
    const adminMemberships = await prisma.userOrganizationMembership.findMany({
      where: { organizationId: orgId, role: "ADMIN" },
      select: { user: { select: { id: true, email: true } } },
    });
    const requesterName = session!.user.name ?? session!.user.email ?? "A manager";
    const html = `
      <p><strong>${esc(requesterName)}</strong> has requested adding a team member to ${esc(org?.name ?? "your organisation")}:</p>
      <p>${esc(email)} — as ${esc(role)} with access to ${propertyIds.length} propert${propertyIds.length === 1 ? "y" : "ies"}.</p>
      <p><a href="${baseUrl}/settings/users">Review the request on the Users page</a> to approve or decline it.</p>`;
    for (const m of adminMemberships) {
      if (!m.user.email) continue;
      sendNotificationEmail(
        m.user.email,
        `Team member request: ${email}`,
        html,
        { organizationId: orgId, userId: m.user.id },
      ).catch(console.error);
    }
    return Response.json({ ok: true, invitationId: invitation.id, requested: true }, { status: 201 });
  }

  // Fire-and-forget
  sendOrgInvitation(
    email,
    session!.user.name ?? session!.user.email ?? "A team member",
    org?.name ?? "your organisation",
    role,
    `${baseUrl}/invite/${token}`,
    expiresAt,
    { organizationId: orgId }, // org-scope the EmailLog row
  ).catch(console.error);

  return Response.json({ ok: true, invitationId: invitation.id, requested: false }, { status: 201 });
}

/**
 * GET /api/invitations
 * Admins: all pending invitations + requests for the org.
 * Managers/accountants: only rows they created (their own requests).
 */
export async function GET() {
  const { error, session } = await requireManager();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) return Response.json([], { status: 200 });

  const isOrgAdmin = session!.user.orgRole === "ADMIN" || (session!.user.role === "ADMIN" && !session!.user.orgRole);

  const invitations = await prisma.orgInvitation.findMany({
    where: {
      organizationId: orgId,
      acceptedAt: null,
      // SENT invites die with their token; REQUESTED rows wait for a decision
      // (expiresAt is reset to +48h at approval time).
      OR: [{ status: "REQUESTED" }, { expiresAt: { gt: new Date() } }],
      ...(isOrgAdmin ? {} : { invitedByUserId: session!.user.id }),
    },
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(invitations);
}
