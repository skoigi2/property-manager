import { NextRequest } from "next/server";
import { validatePortalToken } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { MaintenanceCategory } from "@prisma/client";

const VALID_CATEGORIES = Object.values(MaintenanceCategory);

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const tenant = await validatePortalToken(params.token);
  if (!tenant) {
    return Response.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const body = await req.json();
  const { title, description, category, isEmergency } = body;

  if (!title || typeof title !== "string" || title.trim().length < 3) {
    return Response.json(
      { error: "Title must be at least 3 characters" },
      { status: 400 }
    );
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const job = await prisma.maintenanceJob.create({
    data: {
      propertyId: tenant.unit.property.id,
      unitId: tenant.unitId,
      title: title.trim(),
      description: description?.trim() ?? null,
      category: category ?? "OTHER",
      priority: "MEDIUM",
      status: "OPEN",
      reportedBy: tenant.name,
      submittedViaPortal: true,
      isEmergency: isEmergency === true,
      requiresApproval: false,
    },
    select: { id: true, title: true, status: true },
  });

  return Response.json(job, { status: 201 });
}
