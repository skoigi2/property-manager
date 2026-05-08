import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const log = await prisma.emailLog.findUnique({
    where: { id: params.id },
    include: {
      replies: {
        orderBy: { sentAt: "asc" },
        select: {
          id: true,
          subject: true,
          toEmail: true,
          fromEmail: true,
          sentAt: true,
          status: true,
          kind: true,
        },
      },
      inReplyTo: {
        select: {
          id: true,
          subject: true,
          toEmail: true,
          fromEmail: true,
          sentAt: true,
        },
      },
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(log);
}
