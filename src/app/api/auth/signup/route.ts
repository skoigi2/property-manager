import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendWelcome, sendTeamWelcome, sendNewUserAlert } from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  invitationProblem,
  assertTeamCapacityForInvite,
  applyInvitationAcceptance,
} from "@/lib/invitation-accept";

export async function POST(req: NextRequest) {
  try {
    // Defense-in-depth against scripted account creation.
    const limited = rateLimit(`signup:${getClientIp(req)}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { name, email, password, organizationName, inviteToken } = await req.json();

    // ── Invitation context (signing up FROM an org invite link) ───────────────
    // A valid token means the invitee joins the inviting org instead of
    // founding a brand-new trial org of their own.
    let invitation: Awaited<ReturnType<typeof prisma.orgInvitation.findUnique>> = null;
    if (inviteToken) {
      invitation = await prisma.orgInvitation.findUnique({ where: { token: String(inviteToken) } });
      if (!invitation || invitation.status === "REQUESTED" || invitationProblem(invitation)) {
        return NextResponse.json(
          { error: "This invitation is no longer valid. You can still create an account normally." },
          { status: 400 }
        );
      }
      // The invitee must sign up with the address the invitation was sent to
      // (the client locks the field, but the server is the real gate).
      if (email?.trim().toLowerCase() !== invitation.email.toLowerCase()) {
        return NextResponse.json(
          { error: "Please sign up with the email address this invitation was sent to." },
          { status: 400 }
        );
      }
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!name?.trim() || !email?.trim() || !password || (!invitation && !organizationName?.trim())) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    // ── Check duplicate email ─────────────────────────────────────────────────
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    // Team-member cap of the INVITING org (new member joining it)
    if (invitation) {
      const capacityError = await assertTeamCapacityForInvite(invitation.organizationId);
      if (capacityError) return capacityError;
    }

    // ── Hash password ─────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 12);

    // ── Invited signup: join the inviting org, found nothing ──────────────────
    if (invitation) {
      const invitedUser = await prisma.user.create({
        data: {
          name:           name.trim(),
          email:          email.toLowerCase(),
          password:       hashedPassword,
          // Non-null organizationId means this can never read as super-admin,
          // even for role ADMIN.
          role:           invitation.role,
          organizationId: invitation.organizationId,
        },
      });
      await applyInvitationAcceptance({ userId: invitedUser.id, invitation });

      const [invitingOrg, inviter] = await Promise.all([
        prisma.organization.findUnique({ where: { id: invitation.organizationId }, select: { name: true } }),
        prisma.user.findUnique({ where: { id: invitation.invitedByUserId }, select: { name: true, email: true } }),
      ]);
      // Team-member welcome — NOT the founder one (no trial started, no
      // "set up your first property" onboarding link).
      sendTeamWelcome({
        email:          invitedUser.email as string,
        name:           invitedUser.name ?? "there",
        orgName:        invitingOrg?.name ?? "your organisation",
        role:           invitation.role,
        inviterName:    inviter?.name ?? inviter?.email ?? null,
        userId:         invitedUser.id,
        organizationId: invitation.organizationId,
      }).catch(console.error);
      sendNewUserAlert(invitedUser.email as string, invitedUser.name ?? "Unknown", invitingOrg?.name ?? "an existing organisation").catch(console.error);

      return NextResponse.json({ ok: true, userId: invitedUser.id, invited: true }, { status: 201 });
    }

    // ── Trial window ──────────────────────────────────────────────────────────
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Create org + user + membership atomically via nested writes.
    // (Callback-form $transaction is pgBouncer-incompatible per CLAUDE.md; nested
    // writes compile to a single SQL transaction and let us create all three
    // rows in one round-trip without sequential dependent awaits.)
    const newUser = await prisma.user.create({
      data: {
        name:     name.trim(),
        email:    email.toLowerCase(),
        password: hashedPassword,
        role:     "ADMIN",
        organization: {
          create: {
            name: organizationName.trim(),
            pricingTier: "TRIAL",
            trialEndsAt,
          },
        },
      },
    });
    // The membership references both ids, which only exist after the above
    // resolves — separate insert.
    if (!newUser.organizationId) {
      throw new Error("Organization id missing after signup");
    }
    await prisma.userOrganizationMembership.create({
      data: { userId: newUser.id, organizationId: newUser.organizationId, role: "ADMIN", isBillingOwner: true },
    });
    const user = newUser;

    // ── Send welcome email (fire-and-forget — don't block the response) ───────
    sendWelcome(user.email as string, user.name ?? "there").catch(console.error);
    sendNewUserAlert(user.email as string, user.name ?? "Unknown", organizationName.trim()).catch(console.error);

    return NextResponse.json({ ok: true, userId: user.id }, { status: 201 });
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
