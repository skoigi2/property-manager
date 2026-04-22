import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendWelcome } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, organizationName } = await req.json();

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!name?.trim() || !email?.trim() || !password || !organizationName?.trim()) {
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

    // ── Hash password ─────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 12);

    // ── Trial window ──────────────────────────────────────────────────────────
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // ── Create org + user + membership in one transaction ────────────────────
    const { user } = await prisma.$transaction(async (tx) => {
      // Create the organisation
      const org = await tx.organization.create({
        data: {
          name: organizationName.trim(),
          pricingTier: "TRIAL",
          trialEndsAt,
        },
      });

      // Create the user as ADMIN of that org
      const newUser = await tx.user.create({
        data: {
          name:           name.trim(),
          email:          email.toLowerCase(),
          password:       hashedPassword,
          role:           "ADMIN",
          organizationId: org.id,
        },
      });

      // Create the membership record — org creator is always the initial billing owner
      await tx.userOrganizationMembership.create({
        data: { userId: newUser.id, organizationId: org.id, role: "ADMIN", isBillingOwner: true },
      });

      return { user: newUser, org };
    });

    // ── Send welcome email (fire-and-forget — don't block the response) ───────
    sendWelcome(user.email as string, user.name ?? "there").catch(console.error);

    return NextResponse.json({ ok: true, userId: user.id }, { status: 201 });
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
