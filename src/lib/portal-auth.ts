import { prisma } from "@/lib/prisma";

export async function validatePortalToken(token: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { portalToken: token },
    include: {
      unit: {
        include: {
          property: {
            include: { organization: true },
          },
        },
      },
    },
  });

  if (!tenant) return null;
  if (
    tenant.portalTokenExpiresAt &&
    tenant.portalTokenExpiresAt < new Date()
  ) {
    return null;
  }

  return tenant;
}
