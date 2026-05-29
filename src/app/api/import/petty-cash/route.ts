import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

interface PettyCashRow {
  date?: string;
  type?: string;
  description?: string;
  amount?: string | number;
  propertyName?: string;
  receiptRef?: string;
}

/** Dedupe / match key: day + type + description + amount + property (property-scoped
 *  so two properties' identical entries don't collide). */
function keyOf(dateOnly: string, type: string, desc: string, amt: number, propId: string | null) {
  return `${dateOnly}|${type}|${desc.toLowerCase()}|${amt}|${propId ?? ""}`;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: PettyCashRow[] = body.rows ?? [];
  const mode: "create" | "upsert" = body.mode === "upsert" ? "upsert" : "create";

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, name: true },
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  type Cleaned = {
    rowNum: number;
    date: Date;
    dateOnly: string;
    type: "IN" | "OUT";
    description: string;
    amount: number;
    propertyId: string | null;
    receiptRef: string | null;
  };
  const cleaned: Cleaned[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const dateStr = row.date?.trim();
    const type = row.type?.trim()?.toUpperCase();
    const description = row.description?.trim();
    const amount = parseFloat(String(row.amount ?? "0"));
    const propertyName = row.propertyName?.trim();
    const receiptRef = row.receiptRef?.trim() || null;

    if (!dateStr || isNaN(Date.parse(dateStr))) {
      errors.push({ row: rowNum, reason: "Invalid or missing date" });
      skipped++;
      continue;
    }
    if (!type || !["IN", "OUT"].includes(type)) {
      errors.push({ row: rowNum, reason: `Type must be IN or OUT, got "${type ?? ""}"` });
      skipped++;
      continue;
    }
    if (!description) {
      errors.push({ row: rowNum, reason: "Description is required" });
      skipped++;
      continue;
    }
    if (isNaN(amount) || amount <= 0) {
      errors.push({ row: rowNum, reason: "Amount must be a positive number" });
      skipped++;
      continue;
    }

    // Resolve property by name (case-insensitive). Unmatched names are non-fatal.
    let propertyId: string | null = null;
    if (propertyName) {
      const prop = properties.find((p) => p.name.toLowerCase() === propertyName.toLowerCase());
      if (prop) propertyId = prop.id;
      else errors.push({ row: rowNum, reason: `Property "${propertyName}" not found — imported without property link` });
    }

    const dateOnly = dateStr.split("T")[0];
    cleaned.push({
      rowNum,
      date: new Date(dateOnly + "T00:00:00.000Z"),
      dateOnly,
      type: type as "IN" | "OUT",
      description,
      amount,
      propertyId,
      receiptRef,
    });
  }

  if (cleaned.length === 0) {
    return Response.json({ imported, updated, skipped, errors });
  }

  // Bulk dedupe: fetch existing rows in the batch date span, key in memory.
  const days = cleaned.map((c) => c.dateOnly).sort();
  const minDate = new Date(days[0] + "T00:00:00.000Z");
  const maxDate = new Date(days[days.length - 1] + "T23:59:59.999Z");

  const existing = await prisma.pettyCash.findMany({
    where: { date: { gte: minDate, lte: maxDate } },
    select: { id: true, date: true, type: true, description: true, amount: true, propertyId: true },
  });
  const existingByKey = new Map<string, string>();
  for (const e of existing) {
    existingByKey.set(
      keyOf(e.date.toISOString().slice(0, 10), e.type, e.description, e.amount, e.propertyId),
      e.id,
    );
  }

  const toCreate: Cleaned[] = [];
  const updateOps: { id: string; data: Record<string, unknown> }[] = [];
  const seenInBatch = new Set<string>();

  for (const c of cleaned) {
    const key = keyOf(c.dateOnly, c.type, c.description, c.amount, c.propertyId);
    const existingId = existingByKey.get(key);
    if (existingId || seenInBatch.has(key)) {
      if (mode === "upsert" && existingId) {
        updateOps.push({ id: existingId, data: { receiptRef: c.receiptRef, propertyId: c.propertyId } });
      } else {
        skipped++;
      }
      continue;
    }
    seenInBatch.add(key);
    toCreate.push(c);
  }

  try {
    if (toCreate.length > 0) {
      const result = await prisma.pettyCash.createMany({
        data: toCreate.map((c) => ({
          date: c.date,
          type: c.type,
          description: c.description,
          amount: c.amount,
          propertyId: c.propertyId,
          receiptRef: c.receiptRef,
        })),
      });
      imported = result.count;
    }
    for (let j = 0; j < updateOps.length; j += 25) {
      const chunk = updateOps.slice(j, j + 25);
      await Promise.all(chunk.map((u) => prisma.pettyCash.update({ where: { id: u.id }, data: u.data })));
      updated += chunk.length;
    }
  } catch (err) {
    const detail = (err as Error).message;
    return Response.json(
      {
        error: "Import failed while writing to the database.",
        detail,
        hint: detail.includes("column") || detail.toLowerCase().includes("enum")
          ? "The database may be missing a recent migration."
          : undefined,
      },
      { status: 500 },
    );
  }

  return Response.json({ imported, updated, skipped, errors });
}
