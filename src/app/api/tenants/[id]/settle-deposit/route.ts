import { requireManager, getAccessiblePropertyIds, requireManagerWrite, requirePermissionWrite} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { calcDepositPosition } from "@/lib/deposit";
import { z } from "zod";

const settlementSchema = z.object({
  depositHeld:     z.number().min(0),
  deductions:      z.array(z.object({ reason: z.string().min(1), amount: z.number().min(0) })),
  totalDeductions: z.number().min(0),
  netRefunded:     z.number(),
  settledDate:     z.string(),
  notes:           z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure the tenant belongs to an accessible property
  const tenant = await prisma.tenant.findFirst({
    where: { id: params.id, unit: { propertyId: { in: propertyIds } } },
    select: { id: true },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const settlement = await prisma.depositSettlement.findUnique({
    where: { tenantId: params.id },
  });

  return Response.json(settlement ?? null);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requirePermissionWrite("TENANT_LIFECYCLE");
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findFirst({
    where: { id: params.id, unit: { propertyId: { in: propertyIds } } },
    select: { id: true, depositAmount: true },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  // Prevent duplicate settlement
  const existing = await prisma.depositSettlement.findUnique({ where: { tenantId: params.id } });
  if (existing) return Response.json({ error: "Deposit already settled" }, { status: 409 });

  const body = await req.json();
  const parsed = settlementSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { settledDate, ...rest } = parsed.data;

  // Server-side settlement base: never trust the client's depositHeld when a
  // DEPOSIT receipt trail exists — the base is what was actually received
  // (calcDepositPosition). Only receipt-less (UNVERIFIED) tenants fall back
  // to the client-supplied figure. Deductions/net are recomputed too.
  const receipts = await prisma.incomeEntry.findMany({
    where: { tenantId: params.id, type: "DEPOSIT" },
    select: { grossAmount: true },
  });
  const position = calcDepositPosition(tenant.depositAmount, receipts);
  const depositHeld = position.verification === "VERIFIED" ? position.held : rest.depositHeld;
  const totalDeductions = rest.deductions.reduce((s, d) => s + d.amount, 0);
  const netRefunded = depositHeld - totalDeductions;

  const settlement = await prisma.depositSettlement.create({
    data: {
      tenantId:    params.id,
      settledDate: new Date(settledDate),
      deductions:  rest.deductions,
      notes:       rest.notes,
      depositHeld,
      totalDeductions,
      netRefunded,
    },
  });

  await logAudit({
    userId:    session!.user.id,
    userEmail: session!.user.email,
    action:    "CREATE",
    resource:  "DepositSettlement",
    resourceId: settlement.id,
    organizationId: session!.user.organizationId,
    after: {
      tenantId:       params.id,
      depositHeld,
      depositVerification: position.verification,
      totalDeductions,
      netRefunded,
      settledDate,
    },
  });

  return Response.json(settlement, { status: 201 });
}
