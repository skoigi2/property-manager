import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

function ymd(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * Export every accessible asset pre-shaped into the import-template columns,
 * with the ID column populated, so an edited re-upload in upsert mode updates
 * rows by ID. Keys MUST match ASSET_COLS in src/app/(dashboard)/import/page.tsx.
 */
export async function GET() {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const assets = await prisma.asset.findMany({
    where: { propertyId: { in: propertyIds } },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      vendor: { select: { name: true } },
    },
    orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
  });

  const rows = assets.map((a) => ({
    "Property Name": a.property.name,
    "Name": a.name,
    "Category": a.category as string,
    "Category (Other)": a.categoryOther ?? "",
    "Unit Number": a.unit?.unitNumber ?? "",
    "Serial Number": a.serialNumber ?? "",
    "Model Number": a.modelNumber ?? "",
    "Purchase Date": ymd(a.purchaseDate),
    "Purchase Cost": a.purchaseCost ?? "",
    "Replacement Value": a.replacementValue ?? "",
    "Warranty Expiry": ymd(a.warrantyExpiry),
    "Service Provider": a.serviceProvider ?? "",
    "Service Contact": a.serviceContact ?? "",
    "Vendor Name": a.vendor?.name ?? "",
    "Notes": a.notes ?? "",
    "Disposed Date": ymd(a.disposedAt),
    ID: a.id,
  }));

  return Response.json({ rows });
}
