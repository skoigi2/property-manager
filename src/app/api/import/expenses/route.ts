import { requireManager, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// Large handover imports (hundreds of rows) need more than the default budget.
export const maxDuration = 60;

interface ExpenseRow {
  id?: string;
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
  vatAmount?: string | number;
  paymentMethod?: string;
  paymentReference?: string;
  paymentDate?: string;
  notes?: string;
}

const PAYMENT_METHODS = ["BANK_TRANSFER", "MPESA", "CASH", "CARD", "CHEQUE", "OTHER"];

/** Map free-text payment mode (e.g. "Mpesa", "Cheque", "Bank") to the enum, or null. */
function normalizePaymentMethod(raw?: string): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (PAYMENT_METHODS.includes(v)) return v;
  if (v === "M_PESA" || v === "MPESA") return "MPESA";
  if (v.startsWith("BANK")) return "BANK_TRANSFER";
  if (v === "CARD" || v.includes("CREDIT") || v.includes("DEBIT")) return "CARD";
  return "OTHER";
}

/** Content fingerprint shared by dedup (create) and matching (upsert):
 *  date(day) + category + amount + property + description. */
function fingerprint(parts: {
  dateOnly: string;
  category: string;
  amount: number;
  propertyId: string | null;
  description: string | null;
}): string {
  return [
    parts.dateOnly,
    parts.category,
    parts.amount,
    parts.propertyId ?? "",
    (parts.description ?? "").toLowerCase(),
  ].join("|");
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: ExpenseRow[] = body.rows ?? [];
  // "create" (default) skips rows that already exist (by content fingerprint).
  // "upsert" updates the matched row in place — use for a re-upload to refresh
  // payment status / due date / vendor without creating duplicates.
  const mode: "create" | "upsert" = body.mode === "upsert" ? "upsert" : "create";

  const [units, properties, existing] = await Promise.all([
    prisma.unit.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { name: true } } },
    }),
    prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true, name: true },
    }),
    // Pre-load existing expenses once so we match fingerprints in memory
    // instead of one DB round-trip per row (which times out on large files).
    prisma.expenseEntry.findMany({
      where: { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] },
      select: { id: true, date: true, category: true, amount: true, propertyId: true, description: true },
    }),
  ]);

  // Org-scoped active vendors for name → id linking (case-insensitive).
  const orgId = session!.user.organizationId;
  const vendors = orgId
    ? await prisma.vendor.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true },
      })
    : [];

  // Accessible expense IDs — the authoritative match key when a row carries an
  // ID (from "Export existing"). Updating by ID lets the user change ANY field
  // (amount, date, category, description) without creating a duplicate, which
  // the content-fingerprint match below cannot do.
  const existingIds = new Set(existing.map((e) => e.id));

  const existingByFp = new Map<string, string>();
  for (const e of existing) {
    existingByFp.set(
      fingerprint({
        dateOnly: e.date.toISOString().slice(0, 10),
        category: e.category as string,
        amount: e.amount,
        propertyId: e.propertyId ?? null,
        description: e.description ?? null,
      }),
      e.id,
    );
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createData: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pettyData: any[] = [];
  const updateOps: { id: string; data: Record<string, unknown> }[] = [];
  const queuedFps = new Set<string>(); // dedupe within this file
  const updatedIds = new Set<string>(); // dedupe ID-matched rows within this file

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const dateStr = row.date?.trim();
    const category = row.category?.trim()?.toUpperCase();
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
    const vatRaw = parseFloat(String(row.vatAmount ?? ""));
    const vatAmount = isNaN(vatRaw) || vatRaw < 0 ? null : vatRaw;
    const paymentMethod = normalizePaymentMethod(row.paymentMethod);
    const paymentReference = row.paymentReference?.trim() || null;
    const payStr = row.paymentDate?.trim();
    const paymentDate = payStr && !isNaN(Date.parse(payStr)) ? new Date(payStr) : null;
    const notes = row.notes?.trim() || null;

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

    // Resolve propertyId
    let resolvedPropertyId: string | undefined;
    if (propertyName) {
      const prop = properties.find((p) => p.name.toLowerCase() === propertyName.toLowerCase());
      resolvedPropertyId = prop?.id;
    }

    // Resolve unitId (only when scope is UNIT)
    let resolvedUnitId: string | undefined;
    if (scope === "UNIT" && unitNumber) {
      const unit = units.find((u) => {
        if (u.unitNumber.toLowerCase() !== unitNumber.toLowerCase()) return false;
        return resolvedPropertyId ? u.propertyId === resolvedPropertyId : true;
      });
      resolvedUnitId = unit?.id;
      if (!resolvedPropertyId && unit) resolvedPropertyId = unit.propertyId;
    }

    // Resolve vendor by name (case-insensitive). Unmatched names are non-fatal.
    let resolvedVendorId: string | null = null;
    if (vendorName) {
      const v = vendors.find((vd) => vd.name.toLowerCase() === vendorName.toLowerCase());
      if (v) resolvedVendorId = v.id;
      else errors.push({ row: rowNum, reason: `Vendor "${vendorName}" not found — imported without vendor link` });
    }

    // Full-field payload shared by ID-match update and create.
    const fields = {
      date,
      category,
      description: description || null,
      scope,
      propertyId: resolvedPropertyId || null,
      unitId: resolvedUnitId || null,
      amount,
      amountPaid,
      dueDate,
      vatAmount,
      paymentMethod,
      paymentReference,
      paymentDate,
      notes,
      vendorId: resolvedVendorId,
      isSunkCost,
      paidFromPettyCash,
    };

    // ── ID match (upsert only) — the row was produced by "Export existing".
    // This wins over the fingerprint and updates every field in place.
    const idRaw = row.id?.trim();
    if (mode === "upsert" && idRaw) {
      if (existingIds.has(idRaw)) {
        if (!updatedIds.has(idRaw)) {
          updatedIds.add(idRaw);
          updateOps.push({ id: idRaw, data: fields });
        } else {
          skipped++; // same ID twice in one file
        }
        continue;
      }
      // ID present but not an accessible expense (deleted / wrong org) — fall
      // through and create it as new, with a warning so it isn't silent.
      errors.push({ row: rowNum, reason: `ID "${idRaw}" not found — imported as a new expense` });
    }

    const fp = fingerprint({
      dateOnly,
      category,
      amount,
      propertyId: resolvedPropertyId ?? null,
      description: description || null,
    });
    const existingId = existingByFp.get(fp);

    if (existingId || queuedFps.has(fp)) {
      if (mode === "upsert" && existingId) {
        updateOps.push({
          id: existingId,
          data: { amountPaid, dueDate, vatAmount, paymentMethod, paymentReference, paymentDate, notes, vendorId: resolvedVendorId, isSunkCost, paidFromPettyCash },
        });
      } else {
        skipped++;
      }
      continue;
    }
    queuedFps.add(fp);

    createData.push(fields);

    if (paidFromPettyCash) {
      let pettyCashPropertyId: string | null = resolvedPropertyId ?? null;
      if (!pettyCashPropertyId && resolvedUnitId) {
        pettyCashPropertyId = units.find((u) => u.id === resolvedUnitId)?.propertyId ?? null;
      }
      pettyData.push({
        date,
        type: "OUT",
        amount,
        description: description ?? `${category} expense`,
        propertyId: pettyCashPropertyId,
      });
    }
  }

  try {
    if (createData.length > 0) {
      await prisma.expenseEntry.createMany({ data: createData });
      imported = createData.length;
    }
    if (pettyData.length > 0) {
      await prisma.pettyCash.createMany({ data: pettyData });
    }
    // Updates can't be batched into one statement; run in small concurrent chunks.
    for (let j = 0; j < updateOps.length; j += 25) {
      const chunk = updateOps.slice(j, j + 25);
      await Promise.all(
        chunk.map((u) => prisma.expenseEntry.update({ where: { id: u.id }, data: u.data })),
      );
      updated += chunk.length;
    }
  } catch (err) {
    const detail = (err as Error).message;
    return Response.json(
      {
        error: "Import failed while writing to the database.",
        detail,
        hint: detail.includes("column") || detail.toLowerCase().includes("enum")
          ? "The database may be missing a recent migration — run the pending expense migrations in Supabase."
          : undefined,
      },
      { status: 500 },
    );
  }

  return Response.json({ imported, updated, skipped, errors });
}
