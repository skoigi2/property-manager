import { getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { AssetCategory, Prisma } from "@prisma/client";

export const maxDuration = 60;

interface AssetRow {
  id?: string;
  propertyName?: string;
  unitNumber?: string;
  name?: string;
  category?: string;
  categoryOther?: string;
  serialNumber?: string;
  modelNumber?: string;
  purchaseDate?: string;
  purchaseCost?: string | number;
  replacementValue?: string | number;
  warrantyExpiry?: string;
  serviceProvider?: string;
  serviceContact?: string;
  vendorName?: string;
  notes?: string;
  disposedDate?: string;
}

const VALID_CATEGORIES: AssetCategory[] = [
  "GENERATOR", "LIFT", "HVAC", "POOL", "ELECTRICAL", "PLUMBING", "SECURITY",
  "APPLIANCE", "FURNITURE", "IT_EQUIPMENT", "VEHICLE", "OTHER",
];

function parseDate(v: string | undefined): Date | null | undefined {
  const t = v?.trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? undefined : d;
}
function parseMoney(v: string | number | undefined): number | null | undefined {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/[, ]/g, ""));
  return isNaN(n) || n < 0 ? undefined : n;
}
/** Dedupe key: same property + name + serial number (case-insensitive). */
function fingerprint(propertyId: string, name: string, serial: string | null): string {
  return `${propertyId}|${name.trim().toLowerCase()}|${(serial ?? "").trim().toLowerCase()}`;
}

/**
 * POST { rows, mode?: "upsert" } — bulk-load assets. Property / unit / vendor
 * names resolve to ids (unit and vendor misses are non-fatal); an `id` column
 * (from "Export existing") matches an accessible asset before the fingerprint
 * and updates every field in place. Without upsert, matches are skipped.
 */
export async function POST(req: Request) {
  const { error, session } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rows?: AssetRow[]; mode?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rows = body.rows ?? [];
  const upsert = body.mode === "upsert";
  const organizationId = session!.user.organizationId;

  try {
    const [properties, vendors, existing] = await Promise.all([
      prisma.property.findMany({
        where: { id: { in: propertyIds } },
        select: { id: true, name: true, units: { select: { id: true, unitNumber: true } } },
      }),
      organizationId
        ? prisma.vendor.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
      prisma.asset.findMany({
        where: { propertyId: { in: propertyIds } },
        select: { id: true, propertyId: true, name: true, serialNumber: true },
      }),
    ]);

    const byId = new Map(existing.map((a) => [a.id, a]));
    const byFingerprint = new Map(existing.map((a) => [fingerprint(a.propertyId, a.name, a.serialNumber), a]));
    const updatedIds = new Set<string>();

    let imported = 0, updated = 0, skipped = 0;
    const errors: { row: number; reason: string }[] = [];
    const creates: Prisma.AssetCreateManyInput[] = [];
    const updates: { id: string; data: Record<string, unknown> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const propertyName = row.propertyName?.trim();
      const name = row.name?.trim();
      const categoryRaw = row.category?.trim().toUpperCase().replace(/[\s-]+/g, "_");

      if (!propertyName) { errors.push({ row: rowNum, reason: "Property Name is required" }); skipped++; continue; }
      if (!name) { errors.push({ row: rowNum, reason: "Name is required" }); skipped++; continue; }
      if (!categoryRaw || !VALID_CATEGORIES.includes(categoryRaw as AssetCategory)) {
        errors.push({ row: rowNum, reason: `Invalid Category "${row.category}" — must be one of: ${VALID_CATEGORIES.join(", ")}` });
        skipped++; continue;
      }
      const property = properties.find((p) => p.name.toLowerCase() === propertyName.toLowerCase());
      if (!property) { errors.push({ row: rowNum, reason: `Property "${propertyName}" not found or not accessible` }); skipped++; continue; }

      let unitId: string | null = null;
      if (row.unitNumber?.trim()) {
        const unit = property.units.find((u) => u.unitNumber.toLowerCase() === row.unitNumber!.trim().toLowerCase());
        if (unit) unitId = unit.id;
        else errors.push({ row: rowNum, reason: `Warning: unit "${row.unitNumber}" not found in "${property.name}" — imported without a unit` });
      }
      let vendorId: string | null = null;
      if (row.vendorName?.trim()) {
        const vendor = vendors.find((v) => v.name.toLowerCase() === row.vendorName!.trim().toLowerCase());
        if (vendor) vendorId = vendor.id;
        else errors.push({ row: rowNum, reason: `Warning: vendor "${row.vendorName}" not found — imported without a vendor link` });
      }

      const purchaseDate = parseDate(row.purchaseDate);
      const warrantyExpiry = parseDate(row.warrantyExpiry);
      const disposedAt = parseDate(row.disposedDate);
      const purchaseCost = parseMoney(row.purchaseCost);
      const replacementValue = parseMoney(row.replacementValue);
      if (purchaseDate === undefined || warrantyExpiry === undefined || disposedAt === undefined) {
        errors.push({ row: rowNum, reason: "Dates must be YYYY-MM-DD" }); skipped++; continue;
      }
      if (purchaseCost === undefined || replacementValue === undefined) {
        errors.push({ row: rowNum, reason: "Purchase Cost / Replacement Value must be non-negative numbers" }); skipped++; continue;
      }

      const serialNumber = row.serialNumber?.trim() || null;
      const data = {
        propertyId: property.id,
        unitId,
        name,
        category: categoryRaw as AssetCategory,
        categoryOther: categoryRaw === "OTHER" ? (row.categoryOther?.trim() || null) : null,
        serialNumber,
        modelNumber: row.modelNumber?.trim() || null,
        purchaseDate,
        purchaseCost,
        replacementValue,
        warrantyExpiry,
        serviceProvider: row.serviceProvider?.trim() || null,
        serviceContact: row.serviceContact?.trim() || null,
        vendorId,
        notes: row.notes?.trim() || null,
        disposedAt,
      };

      // ID-first match (round-trip from "Export existing"), then fingerprint.
      const idMatch = row.id?.trim() ? byId.get(row.id.trim()) : undefined;
      if (row.id?.trim() && !idMatch) {
        errors.push({ row: rowNum, reason: `Warning: ID "${row.id}" not found — created as a new asset` });
      }
      const match = idMatch ?? byFingerprint.get(fingerprint(property.id, name, serialNumber));

      if (match) {
        if (!upsert) { skipped++; continue; }
        if (updatedIds.has(match.id)) { errors.push({ row: rowNum, reason: `Duplicate row for "${name}" — first occurrence used` }); skipped++; continue; }
        updatedIds.add(match.id);
        updates.push({ id: match.id, data });
        updated++;
      } else {
        creates.push(data);
        byFingerprint.set(fingerprint(property.id, name, serialNumber), { id: "pending", propertyId: property.id, name, serialNumber });
        imported++;
      }
    }

    if (creates.length) await prisma.asset.createMany({ data: creates });
    for (let i = 0; i < updates.length; i += 25) {
      await prisma.$transaction(updates.slice(i, i + 25).map((u) => prisma.asset.update({ where: { id: u.id }, data: u.data })));
    }

    if (imported || updated) {
      await logAudit({
        userId: session!.user.id,
        userEmail: session!.user.email,
        action: "CREATE",
        resource: "Asset",
        resourceId: `import-${Date.now()}`,
        organizationId,
        after: { imported, updated, skipped, mode: upsert ? "upsert" : "create" },
      });
    }

    return Response.json({ imported, updated, skipped, errors });
  } catch (err: any) {
    return Response.json(
      { error: "Import failed", detail: err?.message ?? String(err), hint: "Nothing from this batch was saved. Check the template columns and try again." },
      { status: 500 },
    );
  }
}
