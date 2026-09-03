import { requireOpsStaff, requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { VendorCategory } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { VENDOR_TRIMMED_SELECT, vendorReadIsTrimmed, normalizeVendorName } from "@/lib/vendor-projection";

const vendorSchema = z.object({
  name:        z.string().min(1, "Name is required"),
  category:    z.nativeEnum(VendorCategory).default("OTHER"),
  phone:       z.string().optional().nullable(),
  email:       z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  taxId:       z.string().optional().nullable(),
  bankDetails: z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
  // Soft duplicate-name warning override ("a vendor called X already exists —
  // use it instead?"). Never a hard block: similar names are legitimate.
  allowDuplicate: z.boolean().optional(),
});

export async function GET(req: Request) {
  // Ops staff incl. CARETAKER. The on-site role only ever gets the trimmed
  // projection — the list endpoint is the exfiltration surface for banking.
  const { session, error } = await requireOpsStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.toLowerCase();
  const category = searchParams.get("category");

  if (vendorReadIsTrimmed(session!.user.orgRole)) {
    const trimmed = await prisma.vendor.findMany({
      where: {
        organizationId: session!.user.organizationId ?? null,
        ...(category ? { category: category as VendorCategory } : {}),
      },
      select: VENDOR_TRIMMED_SELECT,
      orderBy: { name: "asc" },
    });
    // Search only what the role can see (never email / tax id).
    return Response.json(
      q ? trimmed.filter((v) => v.name.toLowerCase().includes(q) || (v.phone ?? "").toLowerCase().includes(q)) : trimmed,
    );
  }

  const vendors = await prisma.vendor.findMany({
    where: {
      organizationId: session!.user.organizationId ?? null,
      ...(category ? { category: category as VendorCategory } : {}),
    },
    include: {
      _count: {
        select: {
          expenses: true,
          maintenanceJobs: true,
          assetLogs: true,
          recurringExpenses: true,
          assets: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const filtered = q
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.phone ?? "").toLowerCase().includes(q) ||
          (v.email ?? "").toLowerCase().includes(q) ||
          (v.taxId ?? "").toLowerCase().includes(q)
      )
    : vendors;

  return Response.json(filtered);
}

export async function POST(req: Request) {
  // Ops staff incl. CARETAKER, with the FULL field set (bank details, tax id):
  // the person who met the contractor captures them completely, in one pass.
  // The response is the full record too — trimming what they just typed would
  // make the create flow look broken. Traceability = audit row below.
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;

  const body = await req.json();
  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, allowDuplicate, ...rest } = parsed.data;
  const orgId = session!.user.organizationId ?? null;

  // Soft duplicate detection (all roles): case/whitespace/punctuation-
  // insensitive name match within the org → 409 with the existing record
  // unless the caller explicitly overrides. Closes the gap left by denying
  // PATCH to caretakers (a near-duplicate with a different account number).
  if (!allowDuplicate) {
    const wanted = normalizeVendorName(rest.name);
    const candidates = await prisma.vendor.findMany({
      where: { organizationId: orgId },
      select: VENDOR_TRIMMED_SELECT,
    });
    const existing = candidates.find((v) => normalizeVendorName(v.name) === wanted);
    if (existing) {
      return Response.json(
        {
          error: `A vendor called “${existing.name}” already exists — use it instead?`,
          code: "DUPLICATE_VENDOR",
          existing,
        },
        { status: 409 },
      );
    }
  }

  const vendor = await prisma.vendor.create({
    data: {
      ...rest,
      email: email || null,
      organizationId: orgId,
    },
    include: {
      _count: {
        select: {
          expenses: true,
          maintenanceJobs: true,
          assetLogs: true,
          recurringExpenses: true,
          assets: true,
        },
      },
    },
  });

  // Who created which vendor, with what. bankDetails / taxId are redacted by
  // logAudit's SENSITIVE_KEY_PATTERNS (presence is recorded, values are not).
  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "Vendor",
    resourceId: vendor.id,
    organizationId: orgId,
    after: {
      name: vendor.name, category: vendor.category, phone: vendor.phone, email: vendor.email,
      taxId: vendor.taxId, bankDetails: vendor.bankDetails, allowDuplicate: !!allowDuplicate,
    },
  });

  return Response.json(vendor, { status: 201 });
}
