import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface RentHistoryRow {
  tenantName?:    string;
  unitNumber?:    string;
  propertyName?:  string;
  monthlyRent?:   string | number;
  effectiveDate?: string;
  reason?:        string;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: RentHistoryRow[] = body.rows ?? [];

  // Load units + their tenants once so we can resolve names without N+1 lookups.
  const units = await prisma.unit.findMany({
    where: { propertyId: { in: propertyIds } },
    include: {
      property: { select: { name: true } },
      tenants:  { select: { id: true, name: true, isActive: true } },
    },
  });

  let imported = 0;
  let skipped  = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 1;

    const tenantName   = row.tenantName?.trim();
    const unitNumber   = row.unitNumber?.trim();
    const propertyName = row.propertyName?.trim();
    const dateStr      = row.effectiveDate?.trim();
    const rent         = parseFloat(String(row.monthlyRent ?? "0"));

    if (!tenantName || !unitNumber || !dateStr || isNaN(rent) || rent <= 0) {
      errors.push({ row: rowNum, reason: "Tenant Name, Unit Number, Effective Date and positive Monthly Rent are required" });
      skipped++;
      continue;
    }

    if (isNaN(Date.parse(dateStr))) {
      errors.push({ row: rowNum, reason: "Invalid Effective Date" });
      skipped++;
      continue;
    }

    // Find unit (by number + optional property name)
    const unit = units.find((u) => {
      const matches = u.unitNumber.toLowerCase() === unitNumber.toLowerCase();
      if (!matches) return false;
      if (propertyName) return u.property.name.toLowerCase() === propertyName.toLowerCase();
      return true;
    });
    if (!unit) {
      errors.push({ row: rowNum, reason: `Unit "${unitNumber}"${propertyName ? ` in "${propertyName}"` : ""} not found` });
      skipped++;
      continue;
    }

    // Find tenant on that unit (active or historical) by name (case-insensitive)
    const tenant = unit.tenants.find((t) => t.name.toLowerCase() === tenantName.toLowerCase());
    if (!tenant) {
      errors.push({ row: rowNum, reason: `Tenant "${tenantName}" not found on unit ${unitNumber}` });
      skipped++;
      continue;
    }

    const effectiveDate = new Date(dateStr);

    // Idempotency: same tenant + date + amount = skip.
    const duplicate = await prisma.rentHistory.findFirst({
      where: { tenantId: tenant.id, effectiveDate, monthlyRent: rent },
    });
    if (duplicate) {
      skipped++;
      continue;
    }

    try {
      await prisma.rentHistory.create({
        data: {
          tenantId:      tenant.id,
          monthlyRent:   rent,
          effectiveDate,
          reason:        row.reason?.trim() || null,
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
