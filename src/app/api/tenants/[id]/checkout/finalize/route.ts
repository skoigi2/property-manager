import { getAccessiblePropertyIds, requirePermissionWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { checkoutProcessSchema } from "@/lib/validations";
import { calcDepositPosition } from "@/lib/deposit";
import { parseFinalReadingInputs, settleFinalUtilities } from "@/lib/checkout-utilities";
import { ownMoveOut } from "@/lib/inspections";
import { damageExpenseFor } from "@/lib/inspection-checkout";
import { startTurnover } from "@/lib/turnover-data";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requirePermissionWrite("TENANT_LIFECYCLE");
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await prisma.tenant.findFirst({
    where: { id: params.id, unit: { propertyId: { in: propertyIds } } },
    include: {
      unit: { include: { property: true } },
      checkoutProcess: { include: { deductions: true } },
    },
  });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  if (tenant.checkoutProcess?.status === "COMPLETED") {
    return Response.json({ error: "Checkout already finalized" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = checkoutProcessSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const totalDeductions = data.deductions.reduce((s, d) => s + d.amount, 0);
  const inventoryDamage = data.damageFound ? data.inventoryDamageAmount : 0;
  // Settlement base is what was actually RECEIVED (DEPOSIT receipt trail),
  // not the contractual depositAmount — a partially-paid deposit must not be
  // refunded in full. Tenants with no receipt trail fall back to contractual.
  const depositReceipts = await prisma.incomeEntry.findMany({
    where: { tenantId: tenant.id, type: "DEPOSIT" },
    select: { grossAmount: true },
  });
  const deposit = calcDepositPosition(tenant.depositAmount, depositReceipts);
  const depositLeft = deposit.held - inventoryDamage - data.rentBalanceOwing - totalDeductions;
  const checkOutDate = new Date(data.checkOutDate);
  const finalInputs = parseFinalReadingInputs(data.finalMeterReadings ?? []);

  // Final water / electricity: read, approved and billed on one final invoice
  // settled from what is left of the deposit — while the tenant is still the
  // unit's occupant. A retry after a later failure reuses the invoice already
  // raised instead of billing twice.
  let finalUtilities: { total: number; invoiceId: string | null; invoiceNumber: string | null };
  const earlierInvoiceId = tenant.checkoutProcess?.finalUtilitiesInvoiceId ?? null;
  const earlierInvoice = earlierInvoiceId
    ? await prisma.invoice.findUnique({ where: { id: earlierInvoiceId }, select: { id: true, invoiceNumber: true, status: true } })
    : null;
  if (earlierInvoice && earlierInvoice.status !== "CANCELLED") {
    finalUtilities = {
      total: tenant.checkoutProcess!.finalUtilitiesAmount,
      invoiceId: earlierInvoice.id,
      invoiceNumber: earlierInvoice.invoiceNumber,
    };
  } else {
    const settled = await settleFinalUtilities({
      tenantId: tenant.id,
      unitId: tenant.unit.id,
      propertyId: tenant.unit.property.id,
      organizationId: tenant.unit.property.organizationId,
      checkOutDate,
      inputs: finalInputs,
      depositLeft,
      accessiblePropertyIds: propertyIds,
      session: session!,
    });
    if (!settled.ok) return Response.json({ error: settled.error }, { status: 400 });
    finalUtilities = {
      total: settled.total,
      invoiceId: settled.invoice?.id ?? null,
      invoiceNumber: settled.invoice?.invoiceNumber ?? null,
    };
  }
  const balanceToRefund = depositLeft - finalUtilities.total;

  // Step 1: upsert + replace deductions, then atomically finalize.
  const checkoutId = tenant.checkoutProcess?.id;

  const baseFields = {
    unitId: tenant.unit.id,
    propertyId: tenant.unit.property.id,
    organizationId: tenant.unit.property.organizationId,
    checkOutDate,
    damageFound: data.damageFound,
    inventoryDamageAmount: inventoryDamage,
    inventoryDamageNotes: data.inventoryDamageNotes ?? null,
    damageKeptByLandlord: data.damageKeptByLandlord,
    rentBalanceOwing: data.rentBalanceOwing,
    rentBalanceSource: data.rentBalanceSource ?? null,
    originalDeposit: tenant.depositAmount,
    depositReceived: deposit.received,
    totalDeductions,
    balanceToRefund,
    keysReturned: (data.keysReturned ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    utilityTransfers: (data.utilityTransfers ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    refundMethod: data.refundMethod ?? null,
    refundDetails: (data.refundDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    notes: data.notes ?? null,
    finalMeterReadings: finalInputs as unknown as Prisma.InputJsonValue,
    finalUtilitiesAmount: finalUtilities.total,
    finalUtilitiesInvoiceId: finalUtilities.invoiceId,
    ...(data.conditionReportId !== undefined ? { conditionReportId: await ownMoveOut(data.conditionReportId, tenant.id) } : {}),
  };

  let processId: string;
  if (checkoutId) {
    await prisma.$transaction([
      prisma.checkoutDeduction.deleteMany({ where: { checkoutId } }),
      prisma.checkoutProcess.update({ where: { id: checkoutId }, data: baseFields }),
      prisma.checkoutDeduction.createMany({
        data: data.deductions.map((d) => ({
          checkoutId,
          description: d.description,
          amount: d.amount,
          category: d.category,
        })),
      }),
    ]);
    processId = checkoutId;
  } else {
    const created = await prisma.checkoutProcess.create({
      data: {
        tenantId: tenant.id,
        ...baseFields,
        deductions: {
          create: data.deductions.map((d) => ({
            description: d.description,
            amount: d.amount,
            category: d.category,
          })),
        },
      },
    });
    processId = created.id;
  }

  // Step 2: atomic close-out — pgBouncer-safe array form.
  const ops: ReturnType<typeof prisma.checkoutProcess.update>[] = [];

  // The move-out inspection behind this checkout: the one linked by "Fill from
  // the inspection", else the tenant's latest handed-in move-out.
  const linkedReportId =
    (await prisma.checkoutProcess.findUnique({ where: { id: processId }, select: { conditionReportId: true } }))?.conditionReportId
    ?? (await prisma.conditionReport.findFirst({
      where: { tenantId: tenant.id, reportType: "MOVE_OUT", status: { in: ["SUBMITTED", "ACCEPTED"] } },
      orderBy: { submittedAt: "desc" },
      select: { id: true },
    }))?.id
    ?? null;
  // Repair jobs raised from it book their own cost when their expense is
  // logged, so the REINSTATEMENT expense covers only the part of the damage
  // charge their accepted quotes don't (never the same repair twice). While any
  // job has no accepted quote its cost is unknown: no expense is booked here
  // and the manager is told (they can add one for anything the jobs don't cover).
  const repairJobs = linkedReportId
    ? await prisma.maintenanceJob.findMany({
        where: { conditionReportId: linkedReportId, status: { not: "CANCELLED" } },
        select: { quotes: { where: { status: "ACCEPTED" }, select: { amount: true } } },
      })
    : [];
  const { amount: damageExpenseAmount, coveredByRepairJobs, unquotedRepairJobs } = damageExpenseFor(
    inventoryDamage,
    repairJobs.map((j) => ({ acceptedQuote: j.quotes.length ? j.quotes.reduce((t, q) => t + (q.amount ?? 0), 0) : null })),
  );
  let createdExpenseId: string | null = null;
  if (data.damageFound && data.damageKeptByLandlord && damageExpenseAmount > 0) {
    const expense = await prisma.expenseEntry.create({
      data: {
        date: checkOutDate,
        unitId: tenant.unit.id,
        propertyId: tenant.unit.property.id,
        scope: "UNIT",
        category: "REINSTATEMENT",
        amount: damageExpenseAmount,
        organizationId: session!.user.organizationId ?? null,
        description: `Move-out damage charge — ${tenant.name} (Unit ${tenant.unit.unitNumber})${
          repairJobs.length ? ` — net of ${repairJobs.length} repair job${repairJobs.length === 1 ? "" : "s"} (accepted quotes ${coveredByRepairJobs.toFixed(2)}) booked separately` : ""
        }${data.inventoryDamageNotes ? ` — ${data.inventoryDamageNotes}` : ""}`,
      },
    });
    createdExpenseId = expense.id;
  }

  // Mirror DepositSettlement for legacy reporting (only if not already settled)
  const existingSettlement = await prisma.depositSettlement.findUnique({
    where: { tenantId: tenant.id },
  });

  const settlementDeductions = [
    ...(inventoryDamage > 0 ? [{ reason: "Inventory damage", amount: inventoryDamage }] : []),
    ...(data.rentBalanceOwing > 0 ? [{ reason: "Rent balance", amount: data.rentBalanceOwing }] : []),
    ...data.deductions.map((d) => ({ reason: d.description, amount: d.amount })),
    ...(finalUtilities.total > 0
      ? [{ reason: `Water & electricity (final bill${finalUtilities.invoiceNumber ? ` ${finalUtilities.invoiceNumber}` : ""})`, amount: finalUtilities.total }]
      : []),
  ];
  const settlementTotalDeductions = inventoryDamage + data.rentBalanceOwing + totalDeductions + finalUtilities.total;

  const tenantBefore = {
    isActive: tenant.isActive,
    vacatedDate: tenant.vacatedDate,
    unitStatus: tenant.unit.status,
  };

  await prisma.$transaction([
    prisma.checkoutProcess.update({
      where: { id: processId },
      data: {
        status: "COMPLETED",
        finalizedAt: new Date(),
        finalizedByUserId: session!.user.id,
        expenseEntryId: createdExpenseId,
        conditionReportId: linkedReportId,
      },
    }),
    ...(existingSettlement
      ? []
      : [
          prisma.depositSettlement.create({
            data: {
              tenantId: tenant.id,
              depositHeld: deposit.held,
              deductions: settlementDeductions,
              totalDeductions: settlementTotalDeductions,
              netRefunded: balanceToRefund,
              settledDate: checkOutDate,
              notes: data.notes ?? null,
            },
          }),
        ]),
    prisma.tenant.update({
      where: { id: tenant.id },
      data: { isActive: false, vacatedDate: checkOutDate },
    }),
    prisma.unit.update({
      where: { id: tenant.unit.id },
      data: { status: "VACANT", vacantSince: checkOutDate },
    }),
  ]);

  // Audit logs (after the transaction so they can't break the operation).
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "Tenant",
    resourceId: tenant.id,
    organizationId: session!.user.organizationId,
    before: tenantBefore,
    after: { isActive: false, vacatedDate: checkOutDate, unitStatus: "VACANT" },
  });

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "CheckoutProcess",
    resourceId: processId,
    organizationId: session!.user.organizationId,
    after: {
      tenantId: tenant.id,
      status: "COMPLETED",
      originalDeposit: tenant.depositAmount,
      depositReceived: deposit.received,
      depositShortfall: deposit.shortfall,
      totalDeductions: settlementTotalDeductions,
      balanceToRefund,
      expenseEntryId: createdExpenseId,
      finalUtilitiesAmount: finalUtilities.total,
      finalUtilitiesInvoice: finalUtilities.invoiceNumber,
    },
  });

  // Suppress unused warning for ops scaffold (we kept it for clarity, but didn't need it).
  void ops;

  // The unit is vacant: start its "ready to re-let" checklist, following the
  // move-out inspection's repair jobs. Best-effort — the checkout is done.
  try {
    const linkedInspection = linkedReportId;
    const keysBack = Object.values(data.keysReturned ?? {}).some((n) => Number(n) > 0);
    await startTurnover({
      unitId: tenant.unit.id,
      propertyId: tenant.unit.property.id,
      organizationId: tenant.unit.property.organizationId,
      tenantId: tenant.id,
      conditionReportId: linkedInspection,
      checkoutId: processId,
      done: { keys: keysBack, meters: finalInputs.length > 0 },
      byName: session!.user.name ?? session!.user.email ?? null,
    });
  } catch (e) {
    console.error("[checkout] could not start the re-let checklist:", e);
  }

  return Response.json({
    ok: true, checkoutId: processId, balanceToRefund,
    ...(repairJobs.length && data.damageFound && data.damageKeptByLandlord
      ? { damageExpense: { amount: createdExpenseId ? damageExpenseAmount : 0, repairJobs: repairJobs.length, unquotedRepairJobs, coveredByRepairJobs } }
      : {}),
  });
}
