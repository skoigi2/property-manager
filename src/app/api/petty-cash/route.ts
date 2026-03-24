import { requireAuth, requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { pettyCashSchema } from "@/lib/validations";
import { calcPettyCashBalance } from "@/lib/calculations";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const entries = await prisma.pettyCash.findMany({ orderBy: { date: "asc" } });
  const withBalance = calcPettyCashBalance(entries);

  return Response.json(withBalance.reverse()); // newest first for display
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = pettyCashSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, ...rest } = parsed.data;
  const entry = await prisma.pettyCash.create({
    data: { ...rest, date: new Date(date) },
  });

  await logAudit({ userId: session!.user.id, userEmail: session!.user.email, action: "CREATE", resource: "PettyCash", resourceId: entry.id, after: { type: entry.type, amount: entry.amount, date: entry.date } });

  return Response.json(entry, { status: 201 });
}
