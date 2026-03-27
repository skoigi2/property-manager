import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  // Get agreement for SLA hours (use first accessible property or the filtered one)
  const agreementPropertyId = filterPropertyId && propertyIds.includes(filterPropertyId)
    ? filterPropertyId
    : propertyIds[0];

  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId: agreementPropertyId },
    select: { kpiEmergencyResponseHrs: true, kpiStandardResponseHrs: true },
  });

  const emergencyHrs = agreement?.kpiEmergencyResponseHrs ?? 24;
  const standardHrs  = agreement?.kpiStandardResponseHrs  ?? 96;

  // Get all non-cancelled jobs in the last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      status: { not: "CANCELLED" },
      reportedDate: { gte: since },
    },
    select: {
      id: true,
      isEmergency: true,
      reportedDate: true,
      acknowledgedAt: true,
      completedDate: true,
      status: true,
    },
  });

  // Calculate SLA compliance
  function withinHrs(from: Date, to: Date | null, hrs: number): boolean {
    if (!to) return false;
    return (to.getTime() - from.getTime()) <= hrs * 60 * 60 * 1000;
  }

  const emergencyJobs  = jobs.filter((j) => j.isEmergency);
  const standardJobs   = jobs.filter((j) => !j.isEmergency);
  const acknowledgedJobs = jobs.filter((j) => j.acknowledgedAt);

  const emergencyWithinSla = emergencyJobs.filter((j) =>
    withinHrs(j.reportedDate, j.acknowledgedAt, emergencyHrs)
  ).length;
  const standardWithinSla = standardJobs.filter((j) =>
    withinHrs(j.reportedDate, j.acknowledgedAt, standardHrs)
  ).length;

  const doneJobs       = jobs.filter((j) => j.status === "DONE");
  const completedTotal = jobs.length;

  return Response.json({
    emergencyTotal:      emergencyJobs.length,
    emergencyWithinSla,
    emergencySlaRate:    emergencyJobs.length > 0 ? (emergencyWithinSla / emergencyJobs.length) * 100 : null,
    standardTotal:       standardJobs.length,
    standardWithinSla,
    standardSlaRate:     standardJobs.length > 0 ? (standardWithinSla / standardJobs.length) * 100 : null,
    totalJobs:           jobs.length,
    doneJobs:            doneJobs.length,
    completionRate:      completedTotal > 0 ? (doneJobs.length / completedTotal) * 100 : null,
    emergencyHrs,
    standardHrs,
  });
}
