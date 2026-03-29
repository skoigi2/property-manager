import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const agents = await prisma.agent.findMany({
    where: q
      ? { name: { contains: q, mode: "insensitive" } }
      : undefined,
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
  const { error } = await requireManager();
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, ...rest } = parsed.data;
  const agent = await prisma.agent.create({
    data: { ...rest, email: email || null },
  });

  return Response.json(agent, { status: 201 });
}
