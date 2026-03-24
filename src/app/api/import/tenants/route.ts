import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface TenantRow {
  name?: string;
  unitNumber?: string;
  propertyName?: string;
  monthlyRent?: string | number;
  serviceCharge?: string | number;
  depositAmount?: string | number;
  leaseStart?: string;
  leaseEnd?: string;
  email?: string;
  phone?: string;
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: TenantRow[] = body.rows ?? [];

  // Load all units for accessible properties (with property name)
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

    const name = row.name?.trim();
    const unitNumber = row.unitNumber?.trim();
    const propertyName = row.propertyName?.trim();

    if (!name || !unitNumber) {
      errors.push({ row: rowNum, reason: "Name and Unit Number are required" });
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

    // Check for existing active tenant with same name in same unit
    const existing = await prisma.tenant.findFirst({
      where: {
        unitId: unit.id,
        name: { equals: name, mode: "insensitive" },
        isActive: true,
      },
    });

    if (existing) {
      errors.push({ row: rowNum, reason: `Active tenant "${name}" already exists in unit ${unitNumber}` });
      skipped++;
      continue;
    }

    try {
      const monthlyRent = parseFloat(String(row.monthlyRent ?? 0)) || 0;
      const serviceCharge = parseFloat(String(row.serviceCharge ?? 0)) || 0;
      const depositAmount = parseFloat(String(row.depositAmount ?? 0)) || 0;
      const leaseStart = row.leaseStart ? new Date(row.leaseStart) : new Date();
      const leaseEnd = row.leaseEnd ? new Date(row.leaseEnd) : null;

      await prisma.$transaction([
        prisma.tenant.create({
          data: {
            name,
            unitId: unit.id,
            monthlyRent,
            serviceCharge: serviceCharge || 0,
            depositAmount: depositAmount || 0,
            leaseStart,
            leaseEnd,
            email: row.email?.trim() || null,
            phone: row.phone?.trim() || null,
            isActive: true,
          },
        }),
        prisma.unit.update({
          where: { id: unit.id },
          data: { status: "ACTIVE" },
        }),
      ]);

      imported++;
    } catch (err) {
      errors.push({ row: rowNum, reason: `Database error: ${(err as Error).message}` });
      skipped++;
    }
  }

  return Response.json({ imported, skipped, errors });
}
