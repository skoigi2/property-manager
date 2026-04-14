import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import type { VendorCategory } from "@prisma/client";

interface VendorRow {
  name?: string;
  category?: string;
  phone?: string;
  email?: string;
  taxId?: string;
  bankDetails?: string;
  notes?: string;
}

const VALID_CATEGORIES: VendorCategory[] = [
  "CONTRACTOR", "SUPPLIER", "UTILITY_PROVIDER",
  "SERVICE_PROVIDER", "CONSULTANT", "OTHER",
];

export async function POST(req: Request) {
  const { error, session } = await requireManager();
  if (error) return error;

  const organizationId = session!.user.organizationId;
  if (!organizationId) {
    return Response.json({ error: "No active organisation" }, { status: 403 });
  }

  const body = await req.json();
  const rows: VendorRow[] = body.rows ?? [];

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const name        = row.name?.trim();
    const categoryRaw = row.category?.trim().toUpperCase();

    if (!name) {
      errors.push({ row: rowNum, reason: "Name is required" });
      skipped++;
      continue;
    }

    if (!categoryRaw || !VALID_CATEGORIES.includes(categoryRaw as VendorCategory)) {
      errors.push({
        row: rowNum,
        reason: `Invalid Category "${categoryRaw}" — must be one of: ${VALID_CATEGORIES.join(", ")}`,
      });
      skipped++;
      continue;
    }

    // Check for existing vendor with same name in this org (case-insensitive)
    const existing = await prisma.vendor.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      skipped++;
      continue; // silent skip — same as units behaviour
    }

    const taxId = row.taxId?.trim() || null;

    try {
      await prisma.vendor.create({
        data: {
          organizationId,
          name,
          category: categoryRaw as VendorCategory,
          phone:       row.phone?.trim()       || null,
          email:       row.email?.trim()       || null,
          taxId,
          bankDetails: row.bankDetails?.trim() || null,
          notes:       row.notes?.trim()       || null,
          isActive: true,
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
