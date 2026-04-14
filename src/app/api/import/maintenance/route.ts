import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from "@prisma/client";

interface MaintenanceRow {
  propertyName?: string;
  title?: string;
  category?: string;
  priority?: string;
  status?: string;
  unitNumber?: string;
  description?: string;
  reportedBy?: string;
  reportedDate?: string;
  scheduledDate?: string;
  cost?: string | number;
  vendorName?: string;
  notes?: string;
  isEmergency?: string;
}

const VALID_CATEGORIES: MaintenanceCategory[] = [
  "PLUMBING", "ELECTRICAL", "STRUCTURAL", "APPLIANCE",
  "PAINTING", "CLEANING", "SECURITY", "PEST_CONTROL", "OTHER",
];

const VALID_PRIORITIES: MaintenancePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const VALID_STATUSES: MaintenanceStatus[] = [
  "OPEN", "IN_PROGRESS", "AWAITING_PARTS", "DONE", "CANCELLED",
];

export async function POST(req: Request) {
  const { error, session } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: MaintenanceRow[] = body.rows ?? [];

  const organizationId = session!.user.organizationId;

  // Load accessible properties with their units
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: {
      id: true,
      name: true,
      units: { select: { id: true, unitNumber: true } },
    },
  });

  // Load vendors for this org (for optional name-matching)
  const vendors = organizationId
    ? await prisma.vendor.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true },
      })
    : [];

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const propertyName = row.propertyName?.trim();
    const title        = row.title?.trim();
    const categoryRaw  = row.category?.trim().toUpperCase();
    const priorityRaw  = row.priority?.trim().toUpperCase();
    const statusRaw    = row.status?.trim().toUpperCase();

    if (!propertyName) {
      errors.push({ row: rowNum, reason: "Property Name is required" });
      skipped++;
      continue;
    }

    if (!title) {
      errors.push({ row: rowNum, reason: "Title is required" });
      skipped++;
      continue;
    }

    if (!categoryRaw || !VALID_CATEGORIES.includes(categoryRaw as MaintenanceCategory)) {
      errors.push({
        row: rowNum,
        reason: `Invalid Category "${categoryRaw}" — must be one of: ${VALID_CATEGORIES.join(", ")}`,
      });
      skipped++;
      continue;
    }

    if (!priorityRaw || !VALID_PRIORITIES.includes(priorityRaw as MaintenancePriority)) {
      errors.push({
        row: rowNum,
        reason: `Invalid Priority "${priorityRaw}" — must be one of: ${VALID_PRIORITIES.join(", ")}`,
      });
      skipped++;
      continue;
    }

    if (!statusRaw || !VALID_STATUSES.includes(statusRaw as MaintenanceStatus)) {
      errors.push({
        row: rowNum,
        reason: `Invalid Status "${statusRaw}" — must be one of: ${VALID_STATUSES.join(", ")}`,
      });
      skipped++;
      continue;
    }

    // Find property
    const property = properties.find(
      (p) => p.name.toLowerCase() === propertyName.toLowerCase()
    );

    if (!property) {
      errors.push({ row: rowNum, reason: `Property "${propertyName}" not found or not accessible` });
      skipped++;
      continue;
    }

    // Optionally find unit
    let unitId: string | null = null;
    if (row.unitNumber?.trim()) {
      const unit = property.units.find(
        (u) => u.unitNumber.toLowerCase() === row.unitNumber!.trim().toLowerCase()
      );
      if (!unit) {
        errors.push({
          row: rowNum,
          reason: `Unit "${row.unitNumber}" not found in property "${propertyName}"`,
        });
        skipped++;
        continue;
      }
      unitId = unit.id;
    }

    // Optionally find vendor by name
    let vendorId: string | null = null;
    if (row.vendorName?.trim()) {
      const vendor = vendors.find(
        (v) => v.name.toLowerCase() === row.vendorName!.trim().toLowerCase()
      );
      if (vendor) vendorId = vendor.id;
      // If vendor not found, continue without it (soft match — don't fail the row)
    }

    const reportedDate  = row.reportedDate  ? new Date(row.reportedDate)  : new Date();
    const scheduledDate = row.scheduledDate ? new Date(row.scheduledDate) : null;
    const cost = row.cost ? parseFloat(String(row.cost)) : null;
    const isEmergency = row.isEmergency?.trim().toLowerCase() === "yes";

    try {
      await prisma.maintenanceJob.create({
        data: {
          propertyId: property.id,
          unitId,
          vendorId,
          title,
          description:  row.description?.trim()  || null,
          category:     categoryRaw as MaintenanceCategory,
          priority:     priorityRaw as MaintenancePriority,
          status:       statusRaw   as MaintenanceStatus,
          reportedBy:   row.reportedBy?.trim()   || null,
          reportedDate: isNaN(reportedDate.getTime()) ? new Date() : reportedDate,
          scheduledDate: scheduledDate && !isNaN(scheduledDate.getTime()) ? scheduledDate : null,
          cost:         cost !== null && !isNaN(cost) ? cost : null,
          notes:        row.notes?.trim()         || null,
          isEmergency,
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
