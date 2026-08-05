import { requireManager, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { calcQtyRateAmount } from "@/lib/calculations";

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
  quantity?: string | number;
  unit?: string;
  unitRate?: string | number;
  sunkCost?: string;
  pettyCash?: string;
  vendorName?: string;
  amountPaid?: string | number;
  dueDate?: string;
  vatAmount?: string | number;
  discount?: string | number;
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

// Mirrors the UnitOfMeasure enum. Free-text like "kg", "no.", "sq m" is
// normalised; anything unmatched becomes OTHER + unitOther (non-fatal).
const UOM_VALUES = ["UNIT", "ITEM", "SET", "PAIR", "KG", "G", "TONNE", "LITRE", "ML", "M", "MM", "M2", "HOUR", "DAY", "TRIP", "OTHER"];
const UOM_ALIASES: Record<string, string> = {
  NO: "UNIT", NOS: "UNIT", EACH: "UNIT", EA: "UNIT", PC: "UNIT", PCS: "UNIT", PIECE: "UNIT", PIECES: "UNIT", COUNT: "UNIT", UNITS: "UNIT",
  ITEMS: "ITEM", SETS: "SET", PAIRS: "PAIR",
  KGS: "KG", KILO: "KG", KILOS: "KG", KILOGRAM: "KG", KILOGRAMS: "KG",
  GRAM: "G", GRAMS: "G", GM: "G", GMS: "G",
  T: "TONNE", TON: "TONNE", TONS: "TONNE", TONNES: "TONNE",
  L: "LITRE", LTR: "LITRE", LTRS: "LITRE", LITRES: "LITRE", LITER: "LITRE", LITERS: "LITRE",
  MLS: "ML", MILLILITRE: "ML", MILLILITRES: "ML",
  METRE: "M", METRES: "M", METER: "M", METERS: "M",
  MILLIMETRE: "MM", MILLIMETRES: "MM",
  SQM: "M2", SQUAREMETRE: "M2", SQUAREMETRES: "M2", SQUAREMETER: "M2", SQUAREMETERS: "M2",
  HR: "HOUR", HRS: "HOUR", HOURS: "HOUR",
  DAYS: "DAY", TRIPS: "TRIP",
};

/** Free-text unit → { unit, unitOther }. Unmatched text falls back to OTHER + unitOther. */
function normalizeUom(raw?: string): { unit: string | null; unitOther: string | null } {
  const t = raw?.trim();
  if (!t) return { unit: null, unitOther: null };
  const v = t.toUpperCase().replace(/²/g, "2").replace(/[.\s\-_/]/g, "");
  if (UOM_VALUES.includes(v)) return { unit: v, unitOther: null };
  if (UOM_ALIASES[v]) return { unit: UOM_ALIASES[v], unitOther: null };
  return { unit: "OTHER", unitOther: t };
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
      select: { id: true, date: true, category: true, amount: true, propertyId: true, description: true, _count: { select: { lineItems: true } } },
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
  const lineCountById = new Map(existing.map((e) => [e.id, e._count.lineItems]));

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
  // Petty rows carry the fingerprint of their expense (Date-derived day, same
  // convention as existingByFp) so they can be linked to the created row's id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pettyData: { fpKey: string; data: any }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateOps: { id: string; data: Record<string, unknown>; lineItem?: any }[] = [];
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
    const qtyRaw = parseFloat(String(row.quantity ?? ""));
    const qty = isNaN(qtyRaw) || qtyRaw <= 0 ? null : qtyRaw;
    const rateRaw = parseFloat(String(row.unitRate ?? ""));
    const unitRate = isNaN(rateRaw) || rateRaw <= 0 ? null : rateRaw;
    const uom = normalizeUom(row.unit);
    const discRaw = parseFloat(String(row.discount ?? ""));
    const discount = isNaN(discRaw) || discRaw <= 0 ? null : discRaw;
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
    // Qty × rate: when both are present the Amount is derived (round2), same
    // as the add-expense form; a typed Amount that disagrees is overridden
    // with a non-fatal warning. Without the pair, Amount is required as before.
    const derived = qty !== null && unitRate !== null ? calcQtyRateAmount(qty, unitRate) : null;
    if (derived !== null && !isNaN(amount) && amount > 0 && Math.abs(amount - derived) > 0.01) {
      errors.push({ row: rowNum, reason: `Amount ${amount} differs from Quantity × Unit Rate = ${derived} — used the calculated amount` });
    }
    const effAmount = derived ?? amount;
    if (isNaN(effAmount) || effAmount <= 0) {
      errors.push({ row: rowNum, reason: "Amount must be a positive number (or provide Quantity + Unit Rate)" });
      skipped++;
      continue;
    }
    // A unit without the qty × rate pair has nowhere to live (units sit on the
    // line item that carries the breakdown) — ignored, non-fatally.
    if (uom.unit && derived === null) {
      errors.push({ row: rowNum, reason: `Unit "${row.unit}" needs both Quantity and Unit Rate — ignored` });
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

    // Synthetic line item carrying the qty × rate breakdown (unit + discount
    // included). amountPaid moves onto the line because line items, when
    // present, are the app-wide source of truth for paid amounts.
    const lineItem = derived !== null
      ? {
          category: "MATERIAL",
          description: description || null,
          amount: derived,
          quantity: qty,
          unitRate,
          unit: uom.unit,
          unitOther: uom.unitOther,
          discountAmount: discount,
          isVatable: false,
          paymentStatus: amountPaid <= 0 ? "UNPAID" : amountPaid >= derived ? "PAID" : "PARTIAL",
          amountPaid,
          paymentReference,
        }
      : null;

    // Full-field payload shared by ID-match update and create.
    const fields = {
      date,
      category,
      description: description || null,
      scope,
      propertyId: resolvedPropertyId || null,
      unitId: resolvedUnitId || null,
      amount: effAmount,
      amountPaid: lineItem ? 0 : amountPaid,
      dueDate,
      vatAmount,
      // Informational only — never enters totals. With a line item the
      // discount lives on the line instead (same rule as the form).
      discountAmount: lineItem ? null : discount,
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
          // A qty × rate row replaces the expense's line items only when it has
          // at most one (the importer's own shape). Multi-line expenses were
          // built in the app — refuse to clobber them, non-fatally.
          if (lineItem && (lineCountById.get(idRaw) ?? 0) > 1) {
            errors.push({ row: rowNum, reason: "Expense has multiple line items — Quantity/Unit/Unit Rate columns ignored" });
            updateOps.push({ id: idRaw, data: { ...fields, amount: undefined, amountPaid, discountAmount: discount } });
          } else {
            updateOps.push({ id: idRaw, data: fields, lineItem: lineItem ?? undefined });
          }
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
      amount: effAmount,
      propertyId: resolvedPropertyId ?? null,
      description: description || null,
    });
    const existingId = existingByFp.get(fp);

    if (existingId || queuedFps.has(fp)) {
      if (mode === "upsert" && existingId) {
        // Fingerprint match refreshes secondary fields only — line items are
        // touched exclusively via the authoritative ID match above.
        updateOps.push({
          id: existingId,
          data: { amountPaid, dueDate, vatAmount, discountAmount: discount, paymentMethod, paymentReference, paymentDate, notes, vendorId: resolvedVendorId, isSunkCost, paidFromPettyCash },
        });
      } else {
        skipped++;
      }
      continue;
    }
    queuedFps.add(fp);

    createData.push(lineItem ? { ...fields, __lineItem: lineItem } : fields);

    if (paidFromPettyCash) {
      let pettyCashPropertyId: string | null = resolvedPropertyId ?? null;
      if (!pettyCashPropertyId && resolvedUnitId) {
        pettyCashPropertyId = units.find((u) => u.id === resolvedUnitId)?.propertyId ?? null;
      }
      pettyData.push({
        fpKey: fingerprint({
          dateOnly: date.toISOString().slice(0, 10),
          category,
          amount: effAmount,
          propertyId: resolvedPropertyId ?? null,
          description: description || null,
        }),
        data: {
          date,
          type: "OUT",
          amount: effAmount,
          description: description ?? `${category} expense`,
          propertyId: pettyCashPropertyId,
        },
      });
    }
  }

  try {
    if (createData.length > 0) {
      // createManyAndReturn (Postgres) hands back the new ids so each petty-cash
      // OUT row can be linked to its expense — the FK cascade then keeps the
      // ledger in sync when the expense is later deleted. Returned order isn't
      // guaranteed, so rows are matched by content fingerprint, not index.
      // Rows with a qty × rate breakdown need a nested line-item create, which
      // createMany can't do — they're created individually in small chunks.
      const CREATED_SELECT = { id: true, date: true, category: true, amount: true, propertyId: true, description: true };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plainRows = createData.filter((d: any) => !d.__lineItem);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineRows = createData.filter((d: any) => d.__lineItem);

      const created = plainRows.length > 0
        ? await prisma.expenseEntry.createManyAndReturn({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: plainRows.map((d: any) => ({ ...d, organizationId: session!.user.organizationId ?? null })),
            select: CREATED_SELECT,
          })
        : [];
      for (let j = 0; j < lineRows.length; j += 25) {
        const chunk = lineRows.slice(j, j + 25);
        const results = await Promise.all(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chunk.map(({ __lineItem, ...d }: any) =>
            prisma.expenseEntry.create({
              data: { ...d, organizationId: session!.user.organizationId ?? null, lineItems: { create: [__lineItem] } },
              select: CREATED_SELECT,
            }),
          ),
        );
        created.push(...results);
      }
      imported = created.length;

      if (pettyData.length > 0) {
        const idByFp = new Map<string, string>();
        for (const e of created) {
          idByFp.set(
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
        await prisma.pettyCash.createMany({
          data: pettyData.map((p) => ({
            ...p.data,
            expenseEntryId: idByFp.get(p.fpKey) ?? null,
            organizationId: session!.user.organizationId ?? null,
          })),
        });
      }
    }
    // Updates can't be batched into one statement; run in small concurrent chunks.
    // A row carrying a qty × rate breakdown replaces the expense's line items
    // (array-form $transaction — callback form is pgBouncer-incompatible).
    for (let j = 0; j < updateOps.length; j += 25) {
      const chunk = updateOps.slice(j, j + 25);
      await Promise.all(
        chunk.map((u) =>
          u.lineItem
            ? prisma.$transaction([
                prisma.expenseEntry.update({ where: { id: u.id }, data: u.data }),
                prisma.expenseLineItem.deleteMany({ where: { expenseId: u.id } }),
                prisma.expenseLineItem.create({ data: { ...u.lineItem, expenseId: u.id } }),
              ])
            : prisma.expenseEntry.update({ where: { id: u.id }, data: u.data }),
        ),
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
