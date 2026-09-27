import { requireManagerWrite, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { importReadingsSchema } from "@/lib/validations";
import { submitReading, updateReading } from "@/lib/utility-readings";
import { defaultReadingDate } from "@/lib/utility-readings-import";

export const maxDuration = 60;

type RowOutcome = { rowNumber: number; outcome: "created" | "updated" | "unchanged" } | { rowNumber: number; outcome: "failed"; error: string };

/**
 * POST /api/utilities/readings/import — a month of readings from the Excel
 * round-trip sheet. Manager tier only (the caretaker reads on the phone). The
 * browser has already matched each row to a meter and shown a preview; here
 * every meter is re-checked against the property and each reading goes through
 * submitReading / updateReading, so imported readings land SUBMITTED and are
 * approved on Review & bill like any other. Row failures don't stop the batch.
 */
export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const parsed = importReadingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid import" }, { status: 400 });
  }
  const { propertyId, periodYear, periodMonth, rows } = parsed.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return access.error!;

  const [property, meters, existing] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } }),
    prisma.utilityMeter.findMany({ where: { propertyId, isActive: true }, select: { id: true } }),
    prisma.meterReading.findMany({
      where: { meter: { propertyId }, periodYear, periodMonth, status: { not: "VOID" } },
      select: { id: true, meterId: true, currentReading: true },
    }),
  ]);
  const meterIds = new Set(meters.map((m) => m.id));
  const existingByMeter = new Map(existing.map((r) => [r.meterId, r]));
  const fallbackDate = defaultReadingDate(periodYear, periodMonth);
  const seen = new Set<string>();

  async function importRow(row: (typeof rows)[number]): Promise<RowOutcome> {
    const fail = (e: string): RowOutcome => ({ rowNumber: row.rowNumber, outcome: "failed", error: e });
    if (!meterIds.has(row.meterId)) return fail("Meter not found on this property.");
    if (seen.has(row.meterId)) return fail("This meter appears twice in the file.");
    seen.add(row.meterId);

    let readingDate: Date | undefined;
    if (row.readingDate) {
      readingDate = new Date(row.readingDate);
      if (isNaN(readingDate.getTime())) return fail("Invalid reading date.");
      if (readingDate.getTime() > Date.now() + 86_400_000) return fail("The reading date is in the future.");
    }
    const notes = row.notes?.trim() || undefined;

    const current = existingByMeter.get(row.meterId);
    if (current) {
      if (current.currentReading === row.currentReading && !readingDate && !notes) {
        return { rowNumber: row.rowNumber, outcome: "unchanged" };
      }
      const res = await updateReading(current.id, { currentReading: row.currentReading, readingDate, notes }, session!);
      return res.ok ? { rowNumber: row.rowNumber, outcome: "updated" } : fail(res.error);
    }
    const res = await submitReading(
      {
        meterId: row.meterId,
        periodYear,
        periodMonth,
        readingDate: readingDate ?? fallbackDate,
        currentReading: row.currentReading,
        notes,
      },
      session!,
    );
    return res.ok ? { rowNumber: row.rowNumber, outcome: "created" } : fail(res.error);
  }

  // Duplicates are claimed in file order before any async work starts, then
  // rows run a few at a time (each is a handful of queries on its own meter).
  const results: RowOutcome[] = [];
  for (let i = 0; i < rows.length; i += 5) {
    const chunk = rows.slice(i, i + 5);
    results.push(...(await Promise.all(chunk.map(importRow))));
  }

  const count = (o: RowOutcome["outcome"]) => results.filter((r) => r.outcome === o).length;
  const summary = { created: count("created"), updated: count("updated"), unchanged: count("unchanged") };
  const failed = results.filter((r): r is Extract<RowOutcome, { outcome: "failed" }> => r.outcome === "failed");

  if (summary.created + summary.updated > 0) {
    await logAudit({
      userId: session!.user.id,
      userEmail: session!.user.email,
      action: "CREATE",
      resource: "MeterReading",
      resourceId: propertyId,
      organizationId: property?.organizationId ?? session!.user.organizationId,
      after: {
        import: "Excel",
        period: `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
        ...summary,
        failed: failed.length,
      },
    });
  }

  return Response.json({ ...summary, failed: failed.map((f) => ({ rowNumber: f.rowNumber, error: f.error })) });
}
