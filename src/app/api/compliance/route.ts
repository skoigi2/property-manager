import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getMonthRange } from "@/lib/date-utils";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = searchParams.get("propertyId");
  const yearParam  = searchParams.get("year");
  const monthParam = searchParams.get("month");

  const effectivePropertyIds =
    filterPropertyId && propertyIds.includes(filterPropertyId)
      ? [filterPropertyId]
      : propertyIds;

  const now   = new Date();
  const year  = yearParam  ? Number(yearParam)  : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  const { from: start, to: end } = getMonthRange(year, month - 1);

  // ── Agreement ────────────────────────────────────────────────────────────────
  const agreementPropertyId = filterPropertyId && propertyIds.includes(filterPropertyId)
    ? filterPropertyId
    : propertyIds[0];

  const agreement = await prisma.managementAgreement.findUnique({
    where: { propertyId: agreementPropertyId },
  });

  const targets = {
    occupancy:             agreement?.kpiOccupancyTarget             ?? 90,
    rentCollection:        agreement?.kpiRentCollectionTarget        ?? 90,
    expenseRatio:          agreement?.kpiExpenseRatioTarget          ?? 85,
    tenantTurnover:        agreement?.kpiTenantTurnoverTarget        ?? 90,
    daysToLease:           agreement?.kpiDaysToLeaseTarget           ?? 60,
    renewalRate:           agreement?.kpiRenewalRateTarget           ?? 90,
    maintenanceCompletion: agreement?.kpiMaintenanceCompletionTarget ?? 95,
    emergencyHrs:          agreement?.kpiEmergencyResponseHrs        ?? 24,
    standardHrs:           agreement?.kpiStandardResponseHrs         ?? 96,
    vacancyFeeThresholdMonths: agreement?.vacancyFeeThresholdMonths  ?? 9,
    repairAuthorityLimit:  agreement?.repairAuthorityLimit           ?? 100000,
    rentRemittanceDay:     agreement?.rentRemittanceDay              ?? 5,
    mgmtFeeInvoiceDay:     agreement?.mgmtFeeInvoiceDay              ?? 7,
  };

  // ── Occupancy ────────────────────────────────────────────────────────────────
  const allUnits = await prisma.unit.findMany({
    where: { propertyId: { in: effectivePropertyIds } },
    select: { status: true, vacantSince: true, unitNumber: true, propertyId: true, id: true,
              property: { select: { name: true } } },
  });
  const totalUnits  = allUnits.length;
  const activeUnits = allUnits.filter((u) => u.status === "ACTIVE").length;
  const occupancyRate = totalUnits > 0 ? (activeUnits / totalUnits) * 100 : null;

  // ── Rent Collection Rate ─────────────────────────────────────────────────────
  const invoicesThisMonth = await prisma.invoice.findMany({
    where: {
      periodYear: year, periodMonth: month,
      tenant: { unit: { propertyId: { in: effectivePropertyIds } } },
      status: { not: "CANCELLED" },
    },
    select: { totalAmount: true, paidAmount: true, status: true },
  });
  const totalExpected = invoicesThisMonth.reduce((s, i) => s + i.totalAmount, 0);
  const totalCollected = invoicesThisMonth
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + (i.paidAmount ?? i.totalAmount), 0);
  const rentCollectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : null;

  // ── Expense Ratio ────────────────────────────────────────────────────────────
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.incomeEntry.aggregate({
      where: {
        date: { gte: start, lt: end },
        type: { not: "DEPOSIT" },
        unit: { propertyId: { in: effectivePropertyIds } },
      },
      _sum: { grossAmount: true },
    }),
    prisma.expenseEntry.aggregate({
      where: {
        date: { gte: start, lt: end },
        isSunkCost: false,
        OR: [
          { propertyId: { in: effectivePropertyIds } },
          { unit: { propertyId: { in: effectivePropertyIds } } },
        ],
      },
      _sum: { amount: true },
    }),
  ]);
  const grossIncome    = incomeAgg._sum.grossAmount  ?? 0;
  const totalExpenses  = expenseAgg._sum.amount      ?? 0;
  const expenseRatio   = grossIncome > 0 ? (totalExpenses / grossIncome) * 100 : null;

  // ── Lease Renewal Rate ───────────────────────────────────────────────────────
  const allActiveTenants = await prisma.tenant.findMany({
    where: { isActive: true, unit: { propertyId: { in: effectivePropertyIds } } },
    select: { renewalStage: true, leaseEnd: true },
  });
  // Tenants whose lease ends within the current quarter
  const quarterEnd = new Date(year, month + 2, 0);
  const renewalsDue = allActiveTenants.filter(
    (t) => t.leaseEnd && t.leaseEnd <= quarterEnd
  );
  const renewed = renewalsDue.filter((t) => t.renewalStage === "RENEWED").length;
  const renewalRate = renewalsDue.length > 0 ? (renewed / renewalsDue.length) * 100 : null;

  // ── Days to Lease ────────────────────────────────────────────────────────────
  // Tenants who became active (leaseStart in last 90 days)
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentTenants = await prisma.tenant.findMany({
    where: {
      leaseStart: { gte: since90 },
      unit: { propertyId: { in: effectivePropertyIds } },
    },
    include: { unit: { select: { vacantSince: true } } },
  });
  const daysToLeaseArr = recentTenants
    .filter((t) => t.unit.vacantSince)
    .map((t) => (t.leaseStart.getTime() - t.unit.vacantSince!.getTime()) / (1000 * 60 * 60 * 24));
  const avgDaysToLease = daysToLeaseArr.length > 0
    ? daysToLeaseArr.reduce((a, b) => a + b, 0) / daysToLeaseArr.length
    : null;

  // ── Maintenance SLA ──────────────────────────────────────────────────────────
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const jobs = await prisma.maintenanceJob.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      status: { not: "CANCELLED" },
      reportedDate: { gte: since90d },
    },
    select: { isEmergency: true, reportedDate: true, acknowledgedAt: true, completedDate: true, status: true, cost: true },
  });

  function withinHrs(from: Date, to: Date | null | undefined, hrs: number) {
    if (!to) return false;
    return (to.getTime() - from.getTime()) <= hrs * 60 * 60 * 1000;
  }

  const emergencyJobs = jobs.filter((j) => j.isEmergency);
  const standardJobs  = jobs.filter((j) => !j.isEmergency);
  const emergencyWithinSla = emergencyJobs.filter((j) => withinHrs(j.reportedDate, j.acknowledgedAt, targets.emergencyHrs)).length;
  const standardWithinSla  = standardJobs.filter((j) => withinHrs(j.reportedDate, j.acknowledgedAt, targets.standardHrs)).length;
  const doneJobs       = jobs.filter((j) => j.status === "DONE").length;
  const emergencySlaRate   = emergencyJobs.length > 0 ? (emergencyWithinSla / emergencyJobs.length) * 100 : null;
  const standardSlaRate    = standardJobs.length  > 0 ? (standardWithinSla  / standardJobs.length)  * 100 : null;
  const maintenanceCompletionRate = jobs.length > 0 ? (doneJobs / jobs.length) * 100 : null;

  // ── Vacancies over threshold ─────────────────────────────────────────────────
  const thresholdMs = targets.vacancyFeeThresholdMonths * 30.44 * 24 * 60 * 60 * 1000;
  const longVacant  = allUnits.filter(
    (u) =>
      u.vacantSince &&
      (u.status === "VACANT" || u.status === "LISTED") &&
      Date.now() - u.vacantSince.getTime() >= thresholdMs
  ).map((u) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    propertyId: u.propertyId,
    propertyName: (u as any).property?.name ?? "",
    vacantSince: u.vacantSince,
    daysVacant: Math.floor((Date.now() - u.vacantSince!.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  // ── Approval queue ───────────────────────────────────────────────────────────
  const approvalQueue = await prisma.maintenanceJob.findMany({
    where: {
      propertyId: { in: effectivePropertyIds },
      requiresApproval: true,
      approvedAt: null,
      status: { not: "CANCELLED" },
    },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { reportedDate: "asc" },
  });

  // ── Deadline alerts ──────────────────────────────────────────────────────────
  const remittanceDate = new Date(year, month - 1, targets.rentRemittanceDay);
  const invoiceDate    = new Date(year, month - 1, targets.mgmtFeeInvoiceDay);

  const mgmtFeeInvoice = await prisma.ownerInvoice.findFirst({
    where: {
      propertyId: { in: propertyIds },
      type: "MANAGEMENT_FEE",
      periodYear: year,
      periodMonth: month,
    },
    select: { id: true },
  });

  const deadlines = [
    {
      label:      "Rent Remittance",
      dueDate:    remittanceDate.toISOString(),
      dayOfMonth: targets.rentRemittanceDay,
      done:       false,
      overdue:    now > remittanceDate,
      daysUntil:  Math.ceil((remittanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    },
    {
      label:      "Management Fee Invoice",
      dueDate:    invoiceDate.toISOString(),
      dayOfMonth: targets.mgmtFeeInvoiceDay,
      done:       !!mgmtFeeInvoice,
      overdue:    !mgmtFeeInvoice && now > invoiceDate,
      daysUntil:  Math.ceil((invoiceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    },
  ];

  return Response.json({
    period: { year, month },
    agreement,
    targets,
    kpis: {
      occupancyRate,
      rentCollectionRate,
      expenseRatio,
      renewalRate,
      avgDaysToLease,
      emergencySlaRate,
      standardSlaRate,
      maintenanceCompletionRate,
    },
    counts: {
      totalUnits,
      activeUnits,
      totalExpected,
      totalCollected,
      grossIncome,
      totalExpenses,
      renewalsDueCount: renewalsDue.length,
      renewedCount: renewed,
      emergencyJobsCount: emergencyJobs.length,
      standardJobsCount: standardJobs.length,
      totalJobsCount: jobs.length,
      doneJobsCount: doneJobs,
    },
    longVacant,
    approvalQueue,
    deadlines,
  });
}
