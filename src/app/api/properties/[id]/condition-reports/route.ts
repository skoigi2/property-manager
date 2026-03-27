import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const reportSchema = z.object({
  reportDate:       z.string().min(1),
  inspector:        z.string().optional(),
  overallCondition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"]),
  summary:          z.string().optional(),
  items:            z.array(z.object({
    area:           z.string(),
    condition:      z.string(),
    notes:          z.string().optional(),
    actionRequired: z.boolean().default(false),
  })).optional(),
  nextReviewDate: z.string().optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds?.includes(params.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const reports = await prisma.buildingConditionReport.findMany({
    where: { propertyId: params.id },
    orderBy: { reportDate: "desc" },
  });

  return Response.json(reports);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds?.includes(params.id)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { reportDate, nextReviewDate, ...rest } = parsed.data;

  const report = await prisma.buildingConditionReport.create({
    data: {
      propertyId: params.id,
      reportDate: new Date(reportDate),
      nextReviewDate: nextReviewDate ? new Date(nextReviewDate) : null,
      ...rest,
    },
  });

  return Response.json(report, { status: 201 });
}
