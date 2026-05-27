import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  /** "1h" | "1d" | "1w" — or an ISO date. */
  until: z.string().min(1),
});

function parseUntil(s: string): Date | null {
  if (s === "1h") return new Date(Date.now() + 60 * 60 * 1000);
  if (s === "1d") return new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (s === "1w") return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const until = parseUntil(parsed.data.until);
  if (!until) return Response.json({ error: "Invalid until" }, { status: 400 });

  const hint = await prisma.actionableHint.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!hint) return Response.json({ error: "Not found" }, { status: 404 });

  const userId = session!.user.id;
  const snooze = await prisma.hintSnooze.upsert({
    where: { hintId_userId: { hintId: params.id, userId } },
    create: { hintId: params.id, userId, until },
    update: { until },
  });

  return Response.json(snooze);
}
