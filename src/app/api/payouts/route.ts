import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireManager,
  requireManagerWrite,
  requirePropertyAccess,
  getAccessiblePropertyIds,
} from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

const payoutSchema = z.object({
  propertyId:  z.string().min(1),
  periodYear:  z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  amount:      z.number().positive(),
  paidAt:      z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  method:      z.enum(["BANK_TRANSFER", "MPESA", "CASH", "CARD", "CHEQUE", "OTHER"]).optional().nullable(),
  reference:   z.string().max(200).optional().nullable(),
  notes:       z.string().max(2000).optional().nullable(),
});

/** GET /api/payouts?propertyId=&year=&month= — remittances for a period. */
export async function GET(req: NextRequest) {
  const { error } = await requireManager();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const propertyId = sp.get("propertyId");
  const year  = Number(sp.get("year"));
  const month = Number(sp.get("month"));

  const accessible = await getAccessiblePropertyIds();
  const where: Record<string, unknown> = {};
  if (propertyId) {
    if (accessible !== null && !accessible.includes(propertyId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    where.propertyId = propertyId;
  } else if (accessible !== null) {
    where.propertyId = { in: accessible };
  }
  if (year)  where.periodYear  = year;
  if (month) where.periodMonth = month;

  const payouts = await prisma.ownerPayout.findMany({
    where,
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { paidAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(payouts);
}

/** POST /api/payouts — record a remittance to the owner. */
export async function POST(req: NextRequest) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = payoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  const access = await requirePropertyAccess(data.propertyId);
  if (!access.ok) return access.error!;

  const payout = await prisma.ownerPayout.create({
    data: {
      propertyId:     data.propertyId,
      periodYear:     data.periodYear,
      periodMonth:    data.periodMonth,
      amount:         data.amount,
      paidAt:         new Date(data.paidAt),
      method:         data.method ?? null,
      reference:      data.reference || null,
      notes:          data.notes || null,
      createdByEmail: session!.user.email ?? "unknown",
      createdByName:  session!.user.name ?? null,
    },
  });

  await logAudit({
    userId:     session!.user.id,
    userEmail:  session!.user.email ?? "unknown",
    action:     "CREATE",
    resource:   "OwnerPayout",
    resourceId: payout.id,
    after:      payout,
  });

  return NextResponse.json(payout, { status: 201 });
}
