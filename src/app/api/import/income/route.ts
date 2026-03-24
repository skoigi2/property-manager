import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface IncomeRow {
  date?: string;
  type?: string;
  unitNumber?: string;
  propertyName?: string;
  grossAmount?: string | number;
  agentCommission?: string | number;
  agentName?: string;
  notes?: string;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: IncomeRow[] = body.rows ?? [];

  // Load all units for accessible properties
  const units = await prisma.unit.findMany({
    where: { propertyId: { in: propertyIds } },
    include: { property: { select: { name: true } } },
  });

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const unitNumber = row.unitNumber?.trim();
    const propertyName = row.propertyName?.trim();
    const type = row.type?.trim();
    const dateStr = row.date?.trim();
    const grossAmount = parseFloat(String(row.grossAmount ?? "0"));

    if (!unitNumber) {
      errors.push({ row: rowNum, reason: "Unit Number is required" });
      skipped++;
      continue;
    }

    // Find matching unit
    const unit = units.find((u) => {
      const unitMatch = u.unitNumber.toLowerCase() === unitNumber.toLowerCase();
      if (!unitMatch) return false;
      if (propertyName) {
        return u.property.name.toLowerCase() === propertyName.toLowerCase();
      }
      return true;
    });

    if (!unit) {
      errors.push({
        row: rowNum,
        reason: `Unit "${unitNumber}"${propertyName ? ` in "${propertyName}"` : ""} not found`,
      });
      skipped++;
      continue;
    }

    if (!dateStr || isNaN(Date.parse(dateStr))) {
      errors.push({ row: rowNum, reason: "Invalid or missing date" });
      skipped++;
      continue;
    }

    if (!type) {
      errors.push({ row: rowNum, reason: "Type is required" });
      skipped++;
      continue;
    }

    if (isNaN(grossAmount) || grossAmount <= 0) {
      errors.push({ row: rowNum, reason: "Gross Amount must be a positive number" });
      skipped++;
      continue;
    }

    const date = new Date(dateStr);
    const dateOnly = date.toISOString().split("T")[0];

    // Duplicate check: same unitId + same date (date-only) + same type + same grossAmount
    const startOfDay = new Date(dateOnly + "T00:00:00.000Z");
    const endOfDay = new Date(dateOnly + "T23:59:59.999Z");

    const duplicate = await prisma.incomeEntry.findFirst({
      where: {
        unitId: unit.id,
        type: type as never,
        grossAmount,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (duplicate) {
      skipped++;
      continue;
    }

    // Find active tenant for unit
    const activeTenant = await prisma.tenant.findFirst({
      where: { unitId: unit.id, isActive: true },
      select: { id: true },
    });

    try {
      const agentCommission = parseFloat(String(row.agentCommission ?? "0")) || 0;

      await prisma.incomeEntry.create({
        data: {
          date,
          type: type as never,
          unitId: unit.id,
          grossAmount,
          agentCommission,
          agentName: row.agentName?.trim() || null,
          note: row.notes?.trim() || null,
          tenantId: activeTenant?.id ?? null,
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
