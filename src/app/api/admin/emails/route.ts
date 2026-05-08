import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { manualEmailSchema } from "@/lib/validations";
import { sendAndLog } from "@/lib/email";
import type { Prisma, EmailKind } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const kind = searchParams.get("kind") as EmailKind | null;
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const cursor = searchParams.get("cursor");

  const where: Prisma.EmailLogWhereInput = {};
  if (kind) where.kind = kind;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { toEmail: { contains: q, mode: "insensitive" } },
      { fromEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.emailLog.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      kind: true,
      fromEmail: true,
      toEmail: true,
      replyTo: true,
      subject: true,
      status: true,
      resendId: true,
      sentAt: true,
      organizationId: true,
      userId: true,
      inReplyToId: true,
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return NextResponse.json({ items, nextCursor });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = manualEmailSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { to, subject, bodyHtml, replyTo, inReplyToId } = parsed.data;

  let originalOrgId: string | null = null;
  if (inReplyToId) {
    const original = await prisma.emailLog.findUnique({
      where: { id: inReplyToId },
      select: { id: true, organizationId: true },
    });
    if (!original) {
      return NextResponse.json({ error: "Original email not found" }, { status: 404 });
    }
    originalOrgId = original.organizationId;
  }

  try {
    const result = await sendAndLog({
      kind: "MANUAL",
      to,
      subject,
      html: bodyHtml,
      replyTo: replyTo && replyTo.length > 0 ? replyTo : undefined,
      userId: session!.user.id,
      organizationId: originalOrgId,
      inReplyToId: inReplyToId ?? null,
    });
    const log = await prisma.emailLog.findUnique({ where: { id: result.id } });
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
