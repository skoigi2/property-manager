import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  propertyId:  z.string().min(1),
  unitId:      z.string().optional(),
  title:       z.string().min(1, "Title required"),
  description: z.string().optional(),
  category:    z.enum(["PLUMBING","ELECTRICAL","STRUCTURAL","APPLIANCE","PAINTING","CLEANING","SECURITY","PEST_CONTROL","OTHER"]).default("OTHER"),
  priority:    z.enum(["LOW","MEDIUM","HIGH","URGENT"]).default("MEDIUM"),
  reportedBy:  z.string().optional(),
  assignedTo:  z.string().optional(),
  reportedDate:  z.string().optional(),
  scheduledDate: z.string().optional(),
  cost:          z.coerce.number().min(0).optional(),
  notes:         z.string().optional(),
  isEmergency:   z.boolean().default(false),
});

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");

  const effectivePropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      ...(status ? { status: status as never } : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
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
  const { error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { reportedDate, scheduledDate, ...rest } = parsed.data;

  const job = await prisma.maintenanceJob.create({
    data: {
      ...rest,
      reportedDate: reportedDate ? new Date(reportedDate) : new Date(),
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
    },
  });

  return Response.json(job, { status: 201 });
}
