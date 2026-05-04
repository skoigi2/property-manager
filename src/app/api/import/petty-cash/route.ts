import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

interface PettyCashRow {
  date?: string;
  type?: string;
  description?: string;
  amount?: string | number;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const rows: PettyCashRow[] = body.rows ?? [];

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  type Cleaned = {
    rowNum: number;
    date: Date;
    dateOnly: string;
    type: "IN" | "OUT";
    description: string;
    amount: number;
  };

  const cleaned: Cleaned[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const dateStr = row.date?.trim();
    const type = row.type?.trim()?.toUpperCase();
    const description = row.description?.trim();
    const amount = parseFloat(String(row.amount ?? "0"));

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

    const dateOnly = dateStr.split("T")[0];
    cleaned.push({
      rowNum,
      date: new Date(dateOnly + "T00:00:00.000Z"),
      dateOnly,
      type: type as "IN" | "OUT",
      description,
      amount,
    });
  }

  if (cleaned.length === 0) {
    return Response.json({ imported, skipped, errors });
  }

  // Bulk dedupe: fetch all existing rows in the date span of the batch and
  // build an in-memory key set. Avoids 1 query per row.
  const minDate = new Date(
    cleaned.reduce((a, c) => (c.dateOnly < a ? c.dateOnly : a), cleaned[0].dateOnly) +
      "T00:00:00.000Z"
  );
  const maxDate = new Date(
    cleaned.reduce((a, c) => (c.dateOnly > a ? c.dateOnly : a), cleaned[0].dateOnly) +
      "T23:59:59.999Z"
  );

  const existing = await prisma.pettyCash.findMany({
    where: { date: { gte: minDate, lte: maxDate } },
    select: { date: true, type: true, description: true, amount: true },
  });

  const keyOf = (d: Date | string, t: string, desc: string, amt: number) => {
    const day = (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
    return `${day}|${t}|${desc}|${amt}`;
  };
  const existingKeys = new Set(
    existing.map((e) => keyOf(e.date, e.type, e.description, e.amount))
  );

  const toCreate: { date: Date; type: "IN" | "OUT"; description: string; amount: number }[] = [];
  const seenInBatch = new Set<string>();

  for (const c of cleaned) {
    const key = keyOf(c.dateOnly, c.type, c.description, c.amount);
    if (existingKeys.has(key) || seenInBatch.has(key)) {
      skipped++;
      continue;
    }
    seenInBatch.add(key);
    toCreate.push({
      date: c.date,
      type: c.type,
      description: c.description,
      amount: c.amount,
    });
  }

  if (toCreate.length > 0) {
    try {
      const result = await prisma.pettyCash.createMany({ data: toCreate });
      imported = result.count;
    } catch (err) {
      errors.push({ row: 0, reason: `Database error: ${(err as Error).message}` });
    }
  }

  return Response.json({ imported, skipped, errors });
}
