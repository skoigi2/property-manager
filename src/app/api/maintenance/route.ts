import { requireSession, requireOpsStaffWrite, getAccessiblePropertyIds, requirePropertyAccess } from "@/lib/auth-utils";
import { checkVendorForProperty } from "@/lib/maintenance-vendor";
import { createMaintenanceJob } from "@/lib/maintenance-create";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  propertyId:  z.string().min(1),
  // "" comes from the form's "Whole property" placeholder option — it must
  // not reach the FK column.
  unitId:      z.string().optional().transform((v) => (v ? v : undefined)),
  title:       z.string().min(1, "Title required"),
  description: z.string().optional(),
  category:    z.enum(["PLUMBING","ELECTRICAL","STRUCTURAL","APPLIANCE","PAINTING","CLEANING","SECURITY","PEST_CONTROL","OTHER"]).default("OTHER"),
  priority:    z.enum(["LOW","MEDIUM","HIGH","URGENT"]).default("MEDIUM"),
  reportedBy:  z.string().optional(),
  assignedTo:  z.string().optional(),
  vendorId:    z.string().optional().nullable(),
  reportedDate:  z.string().optional(),
  scheduledDate: z.string().optional(),
  cost:          z.coerce.number().min(0).optional(),
  notes:         z.string().optional(),
  isEmergency:   z.boolean().default(false),
});

export async function GET(req: Request) {
  // Any role incl. CARETAKER — scoped by accessible properties.
  const { error } = await requireSession();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");
  const category = searchParams.get("category");
  const portalOnly = searchParams.get("portalOnly") === "true";

  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {}),
      ...(portalOnly ? { submittedViaPortal: true } : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      vendor: { select: { id: true, name: true, category: true, phone: true } },
    },
    orderBy: [
      { status: "asc" },
      { priority: "desc" },
      { reportedDate: "desc" },
    ],
  });

  return Response.json(jobs);
}

export async function POST(req: Request) {
  // Ops staff incl. CARETAKER (on-site staff raise jobs). Subscription
  // write-gate included.
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { reportedDate, scheduledDate, ...rest } = parsed.data;

  // The body names the property, unit and vendor: check each one is the
  // caller's to use (a job, and its case, on another org's property otherwise).
  const access = await requirePropertyAccess(rest.propertyId);
  if (!access.ok) return access.error!;
  if (rest.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: rest.unitId }, select: { propertyId: true } });
    if (!unit || unit.propertyId !== rest.propertyId) {
      return Response.json({ error: "That unit is not in this property" }, { status: 400 });
    }
  }
  if (rest.vendorId) {
    const vendorError = await checkVendorForProperty(rest.vendorId, rest.propertyId);
    if (vendorError) return vendorError;
  }

  const job = await createMaintenanceJob(
    {
      ...rest,
      reportedDate: reportedDate ? new Date(reportedDate) : new Date(),
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    },
    { id: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null },
  );

  return Response.json(job, { status: 201 });
}
