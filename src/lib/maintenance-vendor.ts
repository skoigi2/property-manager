import { prisma } from "@/lib/prisma";

/**
 * A maintenance job may only name a vendor of the property's own organisation.
 * Returns a 400 Response when the vendor is unknown or belongs elsewhere,
 * null when it may be used.
 */
export async function checkVendorForProperty(vendorId: string, propertyId: string): Promise<Response | null> {
  const [vendor, property] = await Promise.all([
    prisma.vendor.findUnique({ where: { id: vendorId }, select: { organizationId: true } }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { organizationId: true } }),
  ]);
  if (!vendor?.organizationId || vendor.organizationId !== property?.organizationId) {
    return Response.json({ error: "That vendor is not one of this organisation's vendors" }, { status: 400 });
  }
  return null;
}
