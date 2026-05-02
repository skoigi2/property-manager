import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const GENERIC_INVALID = "This reset link is invalid or has expired. Please request a new one.";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
    }
    if (typeof token !== "string") {
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    // Look up the user for audit context BEFORE consumption. If the token is
    // garbage, we still get a uniform error response.
    const user = await prisma.user.findUnique({
      where: { passwordResetToken: token },
      select: { id: true, email: true },
    });

    const hashedPassword = await bcrypt.hash(password, 12);

    // Atomic single-use consumption: only update if the token is still present
    // AND not expired. If two concurrent requests race with the same token,
    // only one sees count === 1; the loser is rejected.
    const result = await prisma.user.updateMany({
      where: {
        passwordResetToken:   token,
        passwordResetExpires: { gt: new Date() },
      },
      data: {
        password:             hashedPassword,
        passwordResetToken:   null,
        passwordResetExpires: null,
      },
    });

    if (result.count === 0) {
      // Single message for "no such token" and "expired" — avoids enumeration.
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 });
    }

    if (user) {
      await logAudit({
        userId:    user.id,
        userEmail: user.email ?? null,
        action:    "UPDATE",
        resource:  "PasswordReset",
        resourceId: user.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
