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
  paymentFrequency?: string;
  escalationRate?: string | number;
  parkingFee?: string | number;
  notes?: string;
}

const VALID_PAYMENT_FREQUENCIES = ["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"] as const;
type PaymentFrequency = typeof VALID_PAYMENT_FREQUENCIES[number];

export async function POST(req: Request) {
  try {
    const { error } = await requireManager();
    if (error) return error;

    const propertyIds = await getAccessiblePropertyIds();
    if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const rows: TenantRow[] = body.rows ?? [];
    // "create" (default) skips rows whose tenant already exists.
    // "upsert" updates them in place — use this for a re-upload to fill new fields.
    const mode: "create" | "upsert" = body.mode === "upsert" ? "upsert" : "create";

    // Load all units for accessible properties (with property name)
    const units = await prisma.unit.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { name: true } } },
    });

    let imported = 0;
    let updated = 0;
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

      try {
        const monthlyRent = parseFloat(String(row.monthlyRent ?? 0)) || 0;
        const serviceCharge = parseFloat(String(row.serviceCharge ?? 0)) || 0;
        const depositAmount = parseFloat(String(row.depositAmount ?? 0)) || 0;
        const leaseStart = row.leaseStart ? new Date(row.leaseStart) : new Date();
        const leaseEnd = row.leaseEnd ? new Date(row.leaseEnd) : null;

        const freqRaw = row.paymentFrequency?.trim()?.toUpperCase();
        const paymentFrequency = (freqRaw && (VALID_PAYMENT_FREQUENCIES as readonly string[]).includes(freqRaw))
          ? (freqRaw as PaymentFrequency)
          : null;
        const escalationRateRaw = parseFloat(String(row.escalationRate ?? ""));
        const escalationRate = !isNaN(escalationRateRaw) && escalationRateRaw >= 0 ? escalationRateRaw : null;
        const parkingFeeRaw = parseFloat(String(row.parkingFee ?? ""));
        const parkingFee = !isNaN(parkingFeeRaw) && parkingFeeRaw >= 0 ? parkingFeeRaw : null;

        // Existing tenant lookup — matches active OR inactive tenants on the same unit.
        const existing = await prisma.tenant.findFirst({
          where: {
            unitId: unit.id,
            name: { equals: name, mode: "insensitive" },
          },
        });

        if (existing) {
          if (mode === "create") {
            errors.push({ row: rowNum, reason: `Tenant "${name}" already exists in unit ${unitNumber} (re-upload with Update mode to refresh)` });
            skipped++;
            continue;
          }
          // upsert mode → update the existing tenant in place
          await prisma.tenant.update({
            where: { id: existing.id },
            data: {
              monthlyRent,
              serviceCharge: serviceCharge || 0,
              depositAmount: depositAmount || 0,
              leaseStart,
              leaseEnd,
              email: row.email?.trim() || null,
              phone: row.phone?.trim() || null,
              paymentFrequency,
              escalationRate,
              parkingFee,
              notes: row.notes?.trim() || null,
              // Don't flip isActive on an upsert — preserve whatever the manager set.
            },
          });
          updated++;
          continue;
        }

        // No existing tenant → fresh create.
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
              paymentFrequency,
              escalationRate,
              parkingFee,
              notes: row.notes?.trim() || null,
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

    return Response.json({ imported, updated, skipped, errors });
  } catch (err) {
    // Unexpected failure (e.g. column does not exist because the migration
    // hasn't been applied). Return the underlying message so it's visible
    // in the browser instead of an opaque 500.
    console.error("[POST /api/import/tenants] failed:", err);
    return Response.json(
      { error: "Tenant import failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
