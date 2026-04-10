import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendPasswordReset } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, password: true },
    });

    // Always return 200 to prevent email enumeration
    if (!user || !user.password) {
      // No account (or Google-only account) — silently succeed
      return NextResponse.json({ ok: true });
    }

    // Generate a secure random token (hex, 64 chars)
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken:   token,
        passwordResetExpires: expires,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://property-manager-ke-rho.vercel.app";
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Fire-and-forget — response must not reveal whether email exists
    sendPasswordReset(user.email as string, resetLink).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
