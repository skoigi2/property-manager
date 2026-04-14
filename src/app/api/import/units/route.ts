import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { UnitType, UnitStatus } from "@prisma/client";

interface UnitRow {
  unitNumber?: string;
  propertyName?: string;
  type?: string;
  floor?: string | number;
  sizeSqm?: string | number;
  monthlyRent?: string | number;
  status?: string;
  description?: string;
}

const VALID_UNIT_TYPES: UnitType[] = [
  "BEDSITTER", "ONE_BED", "TWO_BED", "THREE_BED", "FOUR_BED",
  "PENTHOUSE", "COMMERCIAL", "OTHER",
];

const VALID_UNIT_STATUSES: UnitStatus[] = [
  "ACTIVE", "VACANT", "LISTED", "UNDER_NOTICE", "MAINTENANCE", "OWNER_OCCUPIED",
];

export async function POST(req: Request) {
  const { error, session } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: UnitRow[] = body.rows ?? [];

  // Load accessible properties once
  const properties = await prisma.property.findMany({
    where: {
      id: { in: propertyIds },
      organizationId: session!.user.organizationId ?? undefined,
    },
    select: { id: true, name: true },
  });

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const unitNumber  = row.unitNumber?.trim();
    const propertyName = row.propertyName?.trim();
    const typeRaw     = row.type?.trim().toUpperCase();

    if (!unitNumber) {
      errors.push({ row: rowNum, reason: "Unit Number is required" });
      skipped++;
      continue;
    }

    if (!propertyName) {
      errors.push({ row: rowNum, reason: "Property Name is required" });
      skipped++;
      continue;
    }

    if (!typeRaw || !VALID_UNIT_TYPES.includes(typeRaw as UnitType)) {
      errors.push({
        row: rowNum,
        reason: `Invalid Type "${typeRaw}" — must be one of: ${VALID_UNIT_TYPES.join(", ")}`,
      });
      skipped++;
      continue;
    }

    // Find property by name (case-insensitive)
    const property = properties.find(
      (p) => p.name.toLowerCase() === propertyName.toLowerCase()
    );

    if (!property) {
      errors.push({ row: rowNum, reason: `Property "${propertyName}" not found or not accessible` });
      skipped++;
      continue;
    }

    // Check for existing unit with same number in this property
    const existing = await prisma.unit.findFirst({
      where: { propertyId: property.id, unitNumber: { equals: unitNumber, mode: "insensitive" } },
    });

    if (existing) {
      skipped++;
      continue; // silent skip — duplicates are expected during re-imports
    }

    const statusRaw = row.status?.trim().toUpperCase();
    const status: UnitStatus = VALID_UNIT_STATUSES.includes(statusRaw as UnitStatus)
      ? (statusRaw as UnitStatus)
      : "ACTIVE";

    const floor       = row.floor   ? parseInt(String(row.floor),  10) : null;
    const sizeSqm    = row.sizeSqm  ? parseFloat(String(row.sizeSqm))  : null;
    const monthlyRent = row.monthlyRent ? parseFloat(String(row.monthlyRent)) : null;

    try {
      await prisma.unit.create({
        data: {
          unitNumber,
          propertyId: property.id,
          type: typeRaw as UnitType,
          floor:        isNaN(floor!)        ? null : floor,
          sizeSqm:      isNaN(sizeSqm!)      ? null : sizeSqm,
          monthlyRent:  isNaN(monthlyRent!)  ? null : monthlyRent,
          status,
          description: row.description?.trim() || null,
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
