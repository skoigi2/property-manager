import { PrismaClient, MaintenanceStatus, CaseStatus, CaseWaitingOn } from "@prisma/client";

const prisma = new PrismaClient();

function mapStatus(s: MaintenanceStatus): CaseStatus {
  switch (s) {
    case "OPEN":           return "OPEN";
    case "IN_PROGRESS":    return "IN_PROGRESS";
    case "AWAITING_PARTS": return "AWAITING_VENDOR";
    case "DONE":           return "RESOLVED";
    case "CANCELLED":      return "CLOSED";
  }
}

function mapWaitingOn(status: MaintenanceStatus, vendorId: string | null): CaseWaitingOn {
  switch (status) {
    case "OPEN":           return "MANAGER";
    case "IN_PROGRESS":    return vendorId ? "VENDOR" : "MANAGER";
    case "AWAITING_PARTS": return "VENDOR";
    case "DONE":
    case "CANCELLED":      return "NONE";
  }
}

async function main() {
  const jobs = await prisma.maintenanceJob.findMany({
    where: { caseThreadId: null },
    include: { property: { select: { organizationId: true } } },
  });

  console.log(`Found ${jobs.length} maintenance job(s) without a CaseThread.`);
  let created = 0;
  let skipped = 0;

  for (const job of jobs) {
    const orgId = job.property.organizationId;
    if (!orgId) {
      console.warn(`  ⚠ Skipping job ${job.id} — property has no organizationId`);
      skipped++;
      continue;
    }

    const thread = await prisma.caseThread.create({
      data: {
        caseType: "MAINTENANCE",
        subjectId: job.id,
        propertyId: job.propertyId,
        unitId: job.unitId,
        organizationId: orgId,
        title: job.title,
        status: mapStatus(job.status),
        waitingOn: mapWaitingOn(job.status, job.vendorId),
        stageStartedAt: job.updatedAt,
        lastActivityAt: job.updatedAt,
        createdAt: job.createdAt,
      },
    });

    const events: Parameters<typeof prisma.caseEvent.create>[0]["data"][] = [
      {
        caseThreadId: thread.id,
        kind: "COMMENT",
        body: job.description ?? `Maintenance job created: ${job.title}`,
        createdAt: job.createdAt,
      },
    ];
    if (job.vendorId) {
      events.push({
        caseThreadId: thread.id,
        kind: "VENDOR_ASSIGNED",
        body: "Vendor assigned",
        meta: { vendorId: job.vendorId },
        createdAt: job.updatedAt,
      });
    }
    if (job.status !== "OPEN") {
      events.push({
        caseThreadId: thread.id,
        kind: "STATUS_CHANGE",
        body: `Status set to ${job.status}`,
        meta: { to: job.status },
        createdAt: job.updatedAt,
      });
    }
    for (const data of events) {
      await prisma.caseEvent.create({ data });
    }

    await prisma.maintenanceJob.update({
      where: { id: job.id },
      data: { caseThreadId: thread.id },
    });

    created++;
  }

  console.log(`✅ Created ${created} CaseThread(s); skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
