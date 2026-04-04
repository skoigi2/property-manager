import { requireManager } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { VendorCategory } from "@prisma/client";

const vendorSchema = z.object({
  name:        z.string().min(1, "Name is required"),
  category:    z.nativeEnum(VendorCategory).default("OTHER"),
  phone:       z.string().optional().nullable(),
  email:       z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  taxId:       z.string().optional().nullable(),
  bankDetails: z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const { session, error } = await requireManager();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.toLowerCase();
  const category = searchParams.get("category");

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
  const { session, error } = await requireManager();
  if (error) return error;

  const body = await req.json();
  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, ...rest } = parsed.data;

  const vendor = await prisma.vendor.create({
    data: {
      ...rest,
      email: email || null,
      organizationId: session!.user.organizationId ?? null,
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

  return Response.json(vendor, { status: 201 });
}
