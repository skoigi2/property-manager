import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordReset } from "@/lib/email";
import { generateToken, hashToken } from "@/lib/token-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Defense-in-depth: slow automated reset-email spam / enumeration probing.
    const limited = rateLimit(`forgot-password:${getClientIp(req)}`, {
      max: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

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

    // Generate a secure random token; only its hash is persisted so a DB leak
    // cannot be replayed as a live reset link.
    const token = generateToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken:   hashToken(token),
        passwordResetExpires: expires,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://groundworkpm.com";
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Fire-and-forget — response must not reveal whether email exists
    sendPasswordReset(user.email as string, resetLink).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
