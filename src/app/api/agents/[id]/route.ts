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

async function loadAgentOrgId(id: string): Promise<string | null | undefined> {
  const a = await prisma.agent.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!a) return undefined;
  return a.organizationId;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { session, error } = await requireManager();
  if (error) return error;

  const agentOrgId = await loadAgentOrgId(params.id);
  if (agentOrgId === undefined) return Response.json({ error: "Not found" }, { status: 404 });

  const callerOrgId = session!.user.organizationId;
  // Org users may only edit agents in their org. Super-admin (callerOrgId === null) may edit any.
  if (callerOrgId && agentOrgId !== callerOrgId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

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
  const { session, error } = await requireManager();
  if (error) return error;

  const agentOrgId = await loadAgentOrgId(params.id);
  if (agentOrgId === undefined) return Response.json({ error: "Not found" }, { status: 404 });

  const callerOrgId = session!.user.organizationId;
  if (callerOrgId && agentOrgId !== callerOrgId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.agent.delete({ where: { id: params.id } });
  return Response.json({ success: true });
}
