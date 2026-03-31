import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { buildForecast } from "@/lib/forecast-engine";

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const propertyIdParam = searchParams.get("propertyId");
  const horizonParam = parseInt(searchParams.get("months") ?? "6");
  const horizon = [3, 6, 12].includes(horizonParam) ? horizonParam : 6;

  const propertyIds =
    propertyIdParam && accessibleIds.includes(propertyIdParam)
      ? [propertyIdParam]
      : accessibleIds;

  const propertyId =
    propertyIdParam && accessibleIds.includes(propertyIdParam)
      ? propertyIdParam
      : null;

  const [tenants, recurringExpenses, insurancePolicies, agreements] =
    await Promise.all([
      prisma.tenant.findMany({
        where: {
          isActive: true,
          unit: { propertyId: { in: propertyIds } },
        },
        select: {
          id: true,
          name: true,
          monthlyRent: true,
          serviceCharge: true,
          leaseStart: true,
          leaseEnd: true,
          escalationRate: true,
          renewalStage: true,
          proposedRent: true,
          proposedLeaseEnd: true,
          unit: {
            select: {
              unitNumber: true,
              property: { select: { id: true, name: true } },
            },
          },
        },
      }),

      prisma.recurringExpense.findMany({
        where: {
          isActive: true,
          OR: [
            { propertyId: { in: propertyIds } },
            { unit: { propertyId: { in: propertyIds } } },
            { scope: "PORTFOLIO" },
          ],
        },
        select: {
          id: true,
          description: true,
          category: true,
          amount: true,
          frequency: true,
          nextDueDate: true,
          property: { select: { name: true } },
          unit: {
            select: {
              unitNumber: true,
              property: { select: { name: true } },
            },
          },
        },
      }),

      prisma.insurancePolicy.findMany({
        where: { propertyId: { in: propertyIds } },
        select: {
          id: true,
          type: true,
          insurer: true,
          premiumAmount: true,
          premiumFrequency: true,
          startDate: true,
          endDate: true,
          property: { select: { name: true } },
        },
      }),

      prisma.managementAgreement.findMany({
        where: { propertyId: { in: propertyIds } },
        select: {
          propertyId: true,
          managementFeeRate: true,
        },
      }),
    ]);

  const result = buildForecast({
    horizon,
    propertyId,
    tenants,
    recurringExpenses: recurringExpenses as Parameters<typeof buildForecast>[0]["recurringExpenses"],
    insurancePolicies: insurancePolicies as Parameters<typeof buildForecast>[0]["insurancePolicies"],
    agreements,
  });

  return Response.json(result);
}
