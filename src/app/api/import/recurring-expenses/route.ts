import { requireManager, getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const CATEGORIES = [
  "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY","CLEANER",
  "CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","SECURITY",
  "GARBAGE_COLLECTION","LANDSCAPING","PEST_CONTROL","POOL","GENERATOR",
  "ELEVATOR","HVAC","GAS","INSURANCE","PROPERTY_TAX",
  "LEGAL_FEES","LICENSE_PERMIT","MARKETING","BANK_CHARGES","STAFF_WAGES","OTHER",
];
const FREQUENCIES = ["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"];

interface RecurringRow {
  description?: string;
  category?: string;
  amount?: string | number;
  scope?: string;
  propertyName?: string;
  unitNumber?: string;
  frequency?: string;
  nextDueDate?: string;
  vendorName?: string;
  isActive?: string;
}

function normalizeFrequency(raw?: string): string | null {
  if (!raw) return "MONTHLY";
  const v = raw.trim().toUpperCase();
  if (FREQUENCIES.includes(v)) return v;
  if (v.startsWith("MONTH")) return "MONTHLY";
  if (v.startsWith("QUART")) return "QUARTERLY";
  if (v.startsWith("BIAN") || v.startsWith("SEMI") || v.includes("6")) return "BIANNUAL";
  if (v.startsWith("ANN") || v.startsWith("YEAR")) return "ANNUAL";
  return null;
}

export async function POST(req: Request) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: RecurringRow[] = body.rows ?? [];
  const mode: "create" | "upsert" = body.mode === "upsert" ? "upsert" : "create";

  const orgId = session!.user.organizationId;
  const [units, properties, vendors, existing] = await Promise.all([
    prisma.unit.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true, unitNumber: true, propertyId: true } }),
    prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true } }),
    orgId ? prisma.vendor.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true } }) : Promise.resolve([]),
    prisma.recurringExpense.findMany({
      where: {
        OR: [
          { propertyId: { in: propertyIds } },
          { unit: { propertyId: { in: propertyIds } } },
          // PORTFOLIO templates: only the caller's own (or legacy null-org),
          // never another org's — otherwise an upsert could overwrite them.
          {
            AND: [
              { propertyId: null },
              { unitId: null },
              ...(orgId ? [{ OR: [{ organizationId: orgId }, { organizationId: null }] }] : []),
            ],
          },
        ],
      },
      select: { id: true, description: true, category: true, amount: true, propertyId: true, frequency: true },
    }),
  ]);

  // Match key: description + category + amount + property + frequency
  const keyOf = (desc: string, cat: string, amt: number, propId: string | null, freq: string) =>
    `${desc.toLowerCase()}|${cat}|${amt}|${propId ?? ""}|${freq}`;
  const existingByKey = new Map<string, string>();
  for (const e of existing) {
    existingByKey.set(keyOf(e.description, e.category as string, e.amount, e.propertyId ?? null, e.frequency as string), e.id);
  }

  let imported = 0, updated = 0, skipped = 0;
  const errors: { row: number; reason: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toCreate: any[] = [];
  const updateOps: { id: string; data: Record<string, unknown> }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const description = row.description?.trim();
    const category = row.category?.trim()?.toUpperCase();
    const amount = parseFloat(String(row.amount ?? "0"));
    const scope = row.scope?.trim()?.toUpperCase();
    const propertyName = row.propertyName?.trim();
    const unitNumber = row.unitNumber?.trim();
    const frequency = normalizeFrequency(row.frequency);
    const dueStr = row.nextDueDate?.trim();
    const vendorName = row.vendorName?.trim();
    const isActive = row.isActive?.trim().toLowerCase() !== "no";

    if (!description) { errors.push({ row: rowNum, reason: "Description is required" }); skipped++; continue; }
    if (!category || !CATEGORIES.includes(category)) { errors.push({ row: rowNum, reason: `Invalid category "${category ?? ""}"` }); skipped++; continue; }
    if (isNaN(amount) || amount <= 0) { errors.push({ row: rowNum, reason: "Amount must be a positive number" }); skipped++; continue; }
    if (!scope || !["UNIT", "PROPERTY", "PORTFOLIO"].includes(scope)) { errors.push({ row: rowNum, reason: `Invalid scope "${scope ?? ""}"` }); skipped++; continue; }
    if (!frequency) { errors.push({ row: rowNum, reason: `Invalid frequency "${row.frequency ?? ""}". Use MONTHLY, QUARTERLY, BIANNUAL or ANNUAL` }); skipped++; continue; }
    if (!dueStr || isNaN(Date.parse(dueStr))) { errors.push({ row: rowNum, reason: "Next Due Date is missing or invalid" }); skipped++; continue; }

    let resolvedPropertyId: string | null = null;
    if (propertyName) {
      const prop = properties.find((p) => p.name.toLowerCase() === propertyName.toLowerCase());
      if (prop) resolvedPropertyId = prop.id;
      else errors.push({ row: rowNum, reason: `Property "${propertyName}" not found — imported without property link` });
    }
    let resolvedUnitId: string | null = null;
    if (scope === "UNIT" && unitNumber) {
      const unit = units.find((u) => u.unitNumber.toLowerCase() === unitNumber.toLowerCase() && (!resolvedPropertyId || u.propertyId === resolvedPropertyId));
      if (unit) { resolvedUnitId = unit.id; if (!resolvedPropertyId) resolvedPropertyId = unit.propertyId; }
    }
    let resolvedVendorId: string | null = null;
    if (vendorName) {
      const v = vendors.find((vd) => vd.name.toLowerCase() === vendorName.toLowerCase());
      if (v) resolvedVendorId = v.id;
      else errors.push({ row: rowNum, reason: `Vendor "${vendorName}" not found — imported without vendor link` });
    }

    const key = keyOf(description, category, amount, resolvedPropertyId, frequency);
    const existingId = existingByKey.get(key);
    if (existingId || seen.has(key)) {
      if (mode === "upsert" && existingId) {
        updateOps.push({ id: existingId, data: { nextDueDate: new Date(dueStr), vendorId: resolvedVendorId, isActive, amount } });
      } else skipped++;
      continue;
    }
    seen.add(key);
    toCreate.push({
      description, category, amount, scope,
      propertyId: resolvedPropertyId, unitId: resolvedUnitId,
      frequency, nextDueDate: new Date(dueStr), vendorId: resolvedVendorId, isActive,
      organizationId: orgId ?? null,
    });
  }

  try {
    if (toCreate.length > 0) {
      const result = await prisma.recurringExpense.createMany({ data: toCreate });
      imported = result.count;
    }
    for (let j = 0; j < updateOps.length; j += 25) {
      const chunk = updateOps.slice(j, j + 25);
      await Promise.all(chunk.map((u) => prisma.recurringExpense.update({ where: { id: u.id }, data: u.data })));
      updated += chunk.length;
    }
  } catch (err) {
    const detail = (err as Error).message;
    return Response.json(
      {
        error: "Import failed while writing to the database.",
        detail,
        hint: detail.includes("column") || detail.toLowerCase().includes("enum")
          ? "The database may be missing a recent migration (new expense categories)."
          : undefined,
      },
      { status: 500 },
    );
  }

  return Response.json({ imported, updated, skipped, errors });
}
