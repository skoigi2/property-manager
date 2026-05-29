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
  vendorName?: string;
  amountPaid?: string | number;
  dueDate?: string;
}

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: ExpenseRow[] = body.rows ?? [];
  // "create" (default) skips rows that already exist (by content fingerprint).
  // "upsert" updates the matched row in place — use for a re-upload to refresh
  // payment status / due date / vendor without creating duplicates.
  const mode: "create" | "upsert" = body.mode === "upsert" ? "upsert" : "create";

  // Load units + properties for accessible propertyIds
  const units = await prisma.unit.findMany({
    where: { propertyId: { in: propertyIds } },
    include: { property: { select: { name: true } } },
  });

  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, name: true },
  });

  // Org-scoped active vendors for name → id linking (case-insensitive).
  const orgId = session!.user.organizationId;
  const vendors = orgId
    ? await prisma.vendor.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true },
      })
    : [];

  let imported = 0;
  let updated = 0;
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
    const vendorName = row.vendorName?.trim();
    const amountPaidRaw = parseFloat(String(row.amountPaid ?? "0"));
    const amountPaid = isNaN(amountPaidRaw) || amountPaidRaw < 0 ? 0 : amountPaidRaw;
    const dueStr = row.dueDate?.trim();
    const dueDate = dueStr && !isNaN(Date.parse(dueStr)) ? new Date(dueStr) : null;

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

    // Resolve vendor by name (case-insensitive). Unmatched names are non-fatal.
    let resolvedVendorId: string | null = null;
    if (vendorName) {
      const v = vendors.find((vd) => vd.name.toLowerCase() === vendorName.toLowerCase());
      if (v) resolvedVendorId = v.id;
      else errors.push({ row: rowNum, reason: `Vendor "${vendorName}" not found — imported without vendor link` });
    }

    // Content fingerprint: date(day) + category + amount + property + description.
    // Property-scoped so two properties' same-day/same-amount rows don't collide.
    const match = await prisma.expenseEntry.findFirst({
      where: {
        category: category as never,
        amount,
        date: { gte: startOfDay, lte: endOfDay },
        propertyId: resolvedPropertyId || null,
        description: description || null,
      },
    });

    if (match) {
      if (mode === "create") {
        skipped++;
        continue;
      }
      // upsert → refresh payment / vendor / classification on the matched row
      try {
        await prisma.expenseEntry.update({
          where: { id: match.id },
          data: {
            amountPaid,
            dueDate,
            vendorId: resolvedVendorId,
            isSunkCost,
            paidFromPettyCash,
          },
        });
        updated++;
      } catch (err) {
        errors.push({ row: rowNum, reason: `Database error: ${(err as Error).message}` });
        skipped++;
      }
      continue;
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
      // Array-form $transaction — callback form is pgBouncer-incompatible (see CLAUDE.md).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops: any[] = [
        prisma.expenseEntry.create({
          data: {
            date,
            category: category as never,
            description: description || null,
            scope: scope as never,
            propertyId: resolvedPropertyId || null,
            unitId: resolvedUnitId || null,
            amount,
            amountPaid,
            dueDate,
            vendorId: resolvedVendorId,
            isSunkCost,
            paidFromPettyCash,
          },
        }),
      ];
      if (paidFromPettyCash) {
        ops.push(prisma.pettyCash.create({
          data: {
            date,
            type: "OUT",
            amount,
            description: description ?? `${category} expense`,
            propertyId: pettyCashPropertyId,
          },
        }));
      }
      await prisma.$transaction(ops);

      imported++;
    } catch (err) {
      errors.push({ row: rowNum, reason: `Database error: ${(err as Error).message}` });
      skipped++;
    }
  }

  return Response.json({ imported, updated, skipped, errors });
}
