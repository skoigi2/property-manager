import "server-only";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { buildInvoicePaymentOps } from "@/lib/invoice-payment-entries";
import { invoiceLinesTotal } from "@/lib/invoice-payment";
import { approveReadings, submitReading, updateReading } from "@/lib/utility-readings";
import {
  calcReadingCharge,
  readingAnomalies,
  resolveReadingRates,
  resolveTariffForPeriod,
  sumReadingsByUtility,
} from "@/lib/utility-billing";
import {
  depositCoverForUtilities,
  finalUtilitiesCharge,
  type FinalMeter,
  type FinalReadingInput,
  type UnbilledReading,
} from "@/lib/final-utilities";

// Move-out water / electricity (Prisma side of src/lib/final-utilities.ts).
// Loads the unit's meters for the checkout month; at finalize creates the
// final readings, approves them with the tenant's other unbilled readings,
// raises ONE final utilities invoice and settles it from what is left of the
// deposit. Runs BEFORE the tenant is marked vacated, so the final reading's
// occupant snapshot is still this tenant.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FinalUtilitiesData {
  periodYear: number;
  periodMonth: number;
  meters: FinalMeter[];
  unbilled: UnbilledReading[];
}

function periodIdx(y: number, m: number) {
  return y * 12 + (m - 1);
}

/** The unit's active unit meters for the checkout month + the tenant's unbilled readings. */
export async function loadFinalUtilities(tenantId: string, unitId: string, checkOutDate: Date): Promise<FinalUtilitiesData> {
  const periodYear = checkOutDate.getFullYear();
  const periodMonth = checkOutDate.getMonth() + 1;
  const idx = periodIdx(periodYear, periodMonth);

  const meters = await prisma.utilityMeter.findMany({
    where: { unitId, role: "UNIT", isActive: true },
    orderBy: [{ utility: "desc" }, { label: "asc" }],
    select: {
      id: true, utility: true, label: true, meterNumber: true, openingReading: true, ratePerUnitOverride: true, propertyId: true,
      readings: {
        where: { status: { not: "VOID" } },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        select: {
          id: true, periodYear: true, periodMonth: true, previousReading: true, currentReading: true, consumption: true,
          status: true, tenantId: true, amount: true, invoiceId: true, invoice: { select: { status: true } },
        },
      },
    },
  });
  if (meters.length === 0) return { periodYear, periodMonth, meters: [], unbilled: [] };

  const propertyId = meters[0].propertyId;
  const [tariffs, settings] = await Promise.all([
    prisma.utilityTariff.findMany({ where: { propertyId } }),
    prisma.utilitySetting.findMany({ where: { propertyId }, select: { utility: true, unitLabel: true } }),
  ]);
  const rateFor = (m: (typeof meters)[number], y: number, mo: number) =>
    resolveReadingRates(resolveTariffForPeriod(tariffs.filter((t) => t.utility === m.utility), y, mo), m.ratePerUnitOverride)?.ratePerUnit ?? null;
  const billed = (r: { invoiceId: string | null; invoice: { status: string } | null }) => !!r.invoiceId && r.invoice?.status !== "CANCELLED";

  const out: FinalMeter[] = [];
  const unbilled: UnbilledReading[] = [];
  for (const m of meters) {
    const current = m.readings.find((r) => r.periodYear === periodYear && r.periodMonth === periodMonth) ?? null;
    const earlier = m.readings.find((r) => periodIdx(r.periodYear, r.periodMonth) < idx) ?? null;
    const locked = m.readings.some((r) => periodIdx(r.periodYear, r.periodMonth) > idx);
    out.push({
      meterId: m.id,
      utility: m.utility,
      label: m.label,
      meterNumber: m.meterNumber,
      unitLabel: settings.find((s) => s.utility === m.utility)?.unitLabel ?? (m.utility === "WATER" ? "units" : "kWh"),
      previousReading: current?.previousReading ?? earlier?.currentReading ?? m.openingReading,
      ratePerUnit: rateFor(m, periodYear, periodMonth),
      periodReading: current
        ? {
            id: current.id,
            currentReading: current.currentReading,
            billed: billed(current),
            editable: !billed(current) && (current.tenantId === tenantId || current.tenantId === null),
          }
        : null,
      locked,
    });

    for (const r of m.readings) {
      if (r.periodYear === periodYear && r.periodMonth === periodMonth) continue; // the final line covers it
      if (r.tenantId !== tenantId || billed(r)) continue;
      const amount = r.status === "APPROVED" ? r.amount ?? 0 : calcReadingCharge(r.consumption, rateFor(m, r.periodYear, r.periodMonth) ?? 0);
      if (amount <= 0 && r.consumption >= 0) continue;
      unbilled.push({
        readingId: r.id,
        meterId: m.id,
        utility: m.utility,
        label: m.label,
        periodYear: r.periodYear,
        periodMonth: r.periodMonth,
        consumption: r.consumption,
        status: r.status as "SUBMITTED" | "APPROVED",
        amount,
        warning:
          r.status === "SUBMITTED"
            ? readingAnomalies({
                consumption: r.consumption,
                occupied: true,
                history: m.readings
                  .filter((x) => periodIdx(x.periodYear, x.periodMonth) < periodIdx(r.periodYear, r.periodMonth))
                  .map((x) => x.consumption),
              }).find((a) => a.code !== "NEGATIVE")?.message ?? null
            : null,
      });
    }
  }
  return { periodYear, periodMonth, meters: out, unbilled };
}

/** Parses the stored / posted `finalMeterReadings` JSON defensively. */
export function parseFinalReadingInputs(raw: unknown): FinalReadingInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({ meterId: String((x as FinalReadingInput)?.meterId ?? ""), reading: Number((x as FinalReadingInput)?.reading) }))
    .filter((x) => x.meterId && Number.isFinite(x.reading) && x.reading >= 0);
}

export type SettleFinalUtilitiesResult =
  | {
      ok: true;
      total: number;
      water: number;
      electricity: number;
      invoice: { id: string; invoiceNumber: string } | null;
      coveredByDeposit: number;
    }
  | { ok: false; error: string };

export async function settleFinalUtilities(opts: {
  tenantId: string;
  unitId: string;
  propertyId: string;
  organizationId: string | null;
  checkOutDate: Date;
  inputs: FinalReadingInput[];
  /** Deposit left after damage, rent and itemised deductions. */
  depositLeft: number;
  accessiblePropertyIds: string[];
  session: Session;
}): Promise<SettleFinalUtilitiesResult> {
  const { tenantId, unitId, checkOutDate, session } = opts;
  const data = await loadFinalUtilities(tenantId, unitId, checkOutDate);
  if (data.meters.length === 0 && data.unbilled.length === 0) {
    return { ok: true, total: 0, water: 0, electricity: 0, invoice: null, coveredByDeposit: 0 };
  }
  const charge = finalUtilitiesCharge(data.meters, opts.inputs, data.unbilled);
  if (charge.errors.length) return { ok: false, error: charge.errors[0].error };
  if (charge.missing.length) {
    return { ok: false, error: `Enter the final meter reading for: ${charge.missing.join(", ")}.` };
  }

  // 1. The final readings: a new reading for the checkout month, or the
  //    tenant's own unbilled one corrected to the final number.
  const readingIds: string[] = [];
  for (const line of charge.lines.filter((l) => l.kind === "FINAL")) {
    const meter = data.meters.find((m) => m.meterId === line.meterId)!;
    if (meter.periodReading) {
      if (meter.periodReading.currentReading !== line.currentReading) {
        const res = await updateReading(meter.periodReading.id, { currentReading: line.currentReading, readingDate: checkOutDate }, session);
        if (!res.ok) return { ok: false, error: `${meter.label}: ${res.error}` };
      }
      readingIds.push(meter.periodReading.id);
      continue;
    }
    const res = await submitReading(
      {
        meterId: meter.meterId,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        readingDate: checkOutDate,
        currentReading: line.currentReading!,
        notes: "Move-out reading",
      },
      session,
    );
    if (!res.ok) return { ok: false, error: `${meter.label}: ${res.error}` };
    readingIds.push(res.reading.id);
  }
  readingIds.push(...data.unbilled.map((u) => u.readingId));

  // 2. Approve whatever is still SUBMITTED (fixes rate + amount).
  const toApprove = await prisma.meterReading.findMany({
    where: { id: { in: readingIds }, status: "SUBMITTED" },
    select: { id: true },
  });
  if (toApprove.length) {
    const approved = await approveReadings(toApprove.map((r) => r.id), opts.accessiblePropertyIds, session);
    if (approved.errors.length) return { ok: false, error: `${approved.errors[0].meter}: ${approved.errors[0].error}` };
  }

  // 3. One final utilities invoice with every approved, chargeable reading.
  const billable = await prisma.meterReading.findMany({
    where: {
      id: { in: readingIds },
      status: "APPROVED",
      tenantId,
      amount: { gt: 0 },
      OR: [{ invoiceId: null }, { invoice: { status: "CANCELLED" } }],
    },
    select: { id: true, amount: true, meter: { select: { utility: true } } },
  });
  if (billable.length === 0) {
    return { ok: true, total: 0, water: 0, electricity: 0, invoice: null, coveredByDeposit: 0 };
  }
  const sums = sumReadingsByUtility(billable.map((r) => ({ utility: r.meter.utility, amount: r.amount })));
  const lines = {
    rentAmount: 0, serviceCharge: 0, otherCharges: 0, lateFeeAmount: 0,
    waterAmount: round2(sums.waterAmount), electricityAmount: round2(sums.electricityAmount),
    depositAmount: 0, leaseFee: 0,
  };
  const total = invoiceLinesTotal(lines);
  const periodStart = new Date(data.periodYear, data.periodMonth - 1, 1);
  const invoiceNumber = await allocateInvoiceNumber(tenantId, periodStart);
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      tenantId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      rentAmount: 0,
      serviceCharge: 0,
      otherCharges: 0,
      waterAmount: lines.waterAmount,
      electricityAmount: lines.electricityAmount,
      totalAmount: total,
      dueDate: checkOutDate,
      status: "SENT",
      notes: `Final water / electricity at move-out (${checkOutDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`,
      meterReadings: { connect: billable.map((r) => ({ id: r.id })) },
    },
    select: { id: true },
  });

  // 4. Settle it from what is left of the deposit (the rest stays owing).
  const covered = depositCoverForUtilities(opts.depositLeft, total);
  if (covered > 0) {
    const { ops } = await buildInvoicePaymentOps({
      invoice: {
        ...lines,
        id: invoice.id,
        invoiceNumber,
        tenantId,
        unitId,
        propertyId: opts.propertyId,
        organizationId: opts.organizationId,
        alreadyPaid: 0,
      },
      amount: covered,
      date: checkOutDate,
      paymentMethod: "OTHER",
      note: `Settled from the deposit at move-out — ${invoiceNumber}`,
    });
    const paidInFull = covered >= total - 0.01;
    await prisma.$transaction([
      ...ops,
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: covered, ...(paidInFull ? { status: "PAID", paidAt: checkOutDate } : {}) },
      }),
    ]);
  }

  return {
    ok: true,
    total,
    water: lines.waterAmount,
    electricity: lines.electricityAmount,
    invoice: { id: invoice.id, invoiceNumber },
    coveredByDeposit: covered,
  };
}
