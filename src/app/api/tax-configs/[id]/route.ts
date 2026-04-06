import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  label:         z.string().min(1).max(50).optional(),
  rate:          z.number().min(0).max(1).optional(),
  type:          z.enum(["ADDITIVE", "WITHHELD"]).optional(),
  appliesTo:     z.array(z.string()).min(1).optional(),
  isInclusive:   z.boolean().optional(),
  isActive:      z.boolean().optional(),
  effectiveFrom: z.string().optional(),
});

// PATCH /api/tax-configs/[id]
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;

  try {
    const before = await prisma.taxConfiguration.findUnique({ where: { id: params.id } });
    if (!before) return Response.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.taxConfiguration.update({
      where: { id: params.id },
      data: {
        ...(data.label         !== undefined && { label: data.label }),
        ...(data.rate          !== undefined && { rate: data.rate }),
        ...(data.type          !== undefined && { type: data.type }),
        ...(data.appliesTo     !== undefined && { appliesTo: data.appliesTo }),
        ...(data.isInclusive   !== undefined && { isInclusive: data.isInclusive }),
        ...(data.isActive      !== undefined && { isActive: data.isActive }),
        ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
      },
    });

    await logAudit({
      userId:     session!.user.id,
      userEmail:  session!.user.email ?? "",
      action:     "UPDATE",
      resource:   "TaxConfiguration",
      resourceId: params.id,
      before,
      after:      updated,
    });

    return Response.json(updated);
  } catch (err: any) {
    console.error("[PATCH /api/tax-configs/[id]]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/tax-configs/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const config = await prisma.taxConfiguration.findUnique({ where: { id: params.id } });
    if (!config) return Response.json({ error: "Not found" }, { status: 404 });

    const [incomeCount, expenseCount] = await Promise.all([
      prisma.incomeEntry.count({ where: { taxConfigId: params.id } }),
      prisma.expenseLineItem.count({ where: { taxConfigId: params.id } }),
    ]);

    const linkedCount = incomeCount + expenseCount;

    if (linkedCount > 0) {
      const updated = await prisma.taxConfiguration.update({
        where: { id: params.id },
        data: { isActive: false },
      });
      await logAudit({
        userId:     session!.user.id,
        userEmail:  session!.user.email ?? "",
        action:     "UPDATE",
        resource:   "TaxConfiguration",
        resourceId: params.id,
        before:     config,
        after:      updated,
      });
      return Response.json({ deactivated: true, linkedCount });
    }

    await prisma.taxConfiguration.delete({ where: { id: params.id } });
    await logAudit({
      userId:     session!.user.id,
      userEmail:  session!.user.email ?? "",
      action:     "DELETE",
      resource:   "TaxConfiguration",
      resourceId: params.id,
      before:     config,
    });

    return Response.json({ deleted: true });
  } catch (err: any) {
    console.error("[DELETE /api/tax-configs/[id]]", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
