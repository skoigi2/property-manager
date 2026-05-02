import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const orgId = session!.user.organizationId;

  // Super-admin (orgId === null) sees all; org users only see their org's agents.
  const where: Record<string, unknown> = {};
  if (orgId) where.organizationId = orgId;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const agents = await prisma.agent.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return Response.json(agents);
}

const createSchema = z.object({
  name:   z.string().min(1),
  phone:  z.string().optional(),
  email:  z.string().email().optional().or(z.literal("")),
  agency: z.string().optional(),
  notes:  z.string().optional(),
});

export async function POST(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    return Response.json(
      { error: "Super-admin must operate within an organisation context to create agents." },
      { status: 400 },
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const agent = await prisma.agent.create({
    data: { ...rest, email: email || null, organizationId: orgId },
  });

  return Response.json(agent, { status: 201 });
}
