import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name:   z.string().min(1).optional(),
  phone:  z.string().optional().nullable(),
  email:  z.string().email().optional().nullable().or(z.literal("")),
  agency: z.string().optional().nullable(),
  notes:  z.string().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (email !== undefined) data.email = email || null;

  const agent = await prisma.agent.update({
    where: { id: params.id },
    data,
  });

  return Response.json(agent);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  await prisma.agent.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
