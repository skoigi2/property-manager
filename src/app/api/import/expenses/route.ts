import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface ExpenseRow {
  date?: string;
  category?: string;
  description?: string;
  scope?: string;
  propertyName?: string;
  unitNumber?: string;
  amount?: string | number;
  sunkCost?: string;
  pettyCash?: string;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: ExpenseRow[] = body.rows ?? [];

  // Load units + properties for accessible propertyIds
  const units = await prisma.unit.findMany({
    where: { propertyId: { in: propertyIds } },
    include: { property: { select: { name: true } } },
  });

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, name: true },
  });

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const dateStr = row.date?.trim();
    const category = row.category?.trim();
    const description = row.description?.trim();
    const scope = row.scope?.trim()?.toUpperCase();
    const propertyName = row.propertyName?.trim();
    const unitNumber = row.unitNumber?.trim();
    const amount = parseFloat(String(row.amount ?? "0"));
    const isSunkCost = row.sunkCost?.trim().toLowerCase() === "yes";
    const paidFromPettyCash = row.pettyCash?.trim().toLowerCase() === "yes";

    if (!dateStr || isNaN(Date.parse(dateStr))) {
      errors.push({ row: rowNum, reason: "Invalid or missing date" });
      skipped++;
      continue;
    }

    if (!category) {
      errors.push({ row: rowNum, reason: "Category is required" });
      skipped++;
      continue;
    }

    if (!scope || !["UNIT", "PROPERTY", "PORTFOLIO"].includes(scope)) {
      errors.push({ row: rowNum, reason: `Invalid scope "${scope ?? ""}". Must be UNIT, PROPERTY, or PORTFOLIO` });
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

    // Duplicate check: same date + category + amount
    const duplicate = await prisma.expenseEntry.findFirst({
      where: {
        category: category as never,
        amount,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (duplicate) {
      skipped++;
      continue;
    }

    // Resolve propertyId
    let resolvedPropertyId: string | undefined;
    if (propertyName) {
      const prop = properties.find(
        (p) => p.name.toLowerCase() === propertyName.toLowerCase()
      );
      resolvedPropertyId = prop?.id;
    }

    // Resolve unitId (only when scope is UNIT)
    let resolvedUnitId: string | undefined;
    if (scope === "UNIT" && unitNumber) {
      const unit = units.find((u) => {
        const unitMatch = u.unitNumber.toLowerCase() === unitNumber.toLowerCase();
        if (!unitMatch) return false;
        if (resolvedPropertyId) {
          return u.propertyId === resolvedPropertyId;
        }
        return true;
      });
      resolvedUnitId = unit?.id;

      // If we still don't have a propertyId, derive it from the unit
      if (!resolvedPropertyId && unit) {
        resolvedPropertyId = unit.propertyId;
      }
    }

    // For petty cash, determine which property to link
    let pettyCashPropertyId: string | null = null;
    if (paidFromPettyCash) {
      if (resolvedPropertyId) {
        pettyCashPropertyId = resolvedPropertyId;
      } else if (resolvedUnitId) {
        const unit = units.find((u) => u.id === resolvedUnitId);
        pettyCashPropertyId = unit?.propertyId ?? null;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const expense = await tx.expenseEntry.create({
          data: {
            date,
            category: category as never,
            description: description || null,
            scope: scope as never,
            propertyId: resolvedPropertyId || null,
            unitId: resolvedUnitId || null,
            amount,
            isSunkCost,
            paidFromPettyCash,
          },
        });

        if (paidFromPettyCash) {
          await tx.pettyCash.create({
            data: {
              date,
              type: "OUT",
              amount,
              description: description ?? `${category} expense`,
              propertyId: pettyCashPropertyId,
            },
          });
        }

        return expense;
      });

      imported++;
    } catch (err) {
      errors.push({ row: rowNum, reason: `Database error: ${(err as Error).message}` });
      skipped++;
    }
  }

  return Response.json({ imported, skipped, errors });
}
