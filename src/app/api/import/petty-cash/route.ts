import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

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

    const date = new Date(dateStr);
    const dateOnly = dateStr.split("T")[0];
    const startOfDay = new Date(dateOnly + "T00:00:00.000Z");
    const endOfDay = new Date(dateOnly + "T23:59:59.999Z");

    // Duplicate check: same date + type + description + amount
    const duplicate = await prisma.pettyCash.findFirst({
      where: {
        type: type as "IN" | "OUT",
        description,
        amount,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (duplicate) {
      skipped++;
      continue;
    }

    try {
      await prisma.pettyCash.create({
        data: {
          date,
          type: type as "IN" | "OUT",
          description,
          amount,
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: rowNum, reason: `Database error: ${(err as Error).message}` });
      skipped++;
    }
  }

  return Response.json({ imported, skipped, errors });
}
