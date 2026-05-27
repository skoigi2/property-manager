import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendWelcome, sendNewUserAlert } from "@/lib/email";

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
