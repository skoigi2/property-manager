import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { differenceInDays, format, startOfMonth, endOfMonth } from "date-fns";

export type EventType =
  | "LEASE_EXPIRY"
  | "LEASE_START"
  | "MAINTENANCE_DUE"
  | "INSURANCE_RENEWAL"
  | "COMPLIANCE_EXPIRY"
  | "RECURRING_EXPENSE"
  | "RENT_REMITTANCE"
  | "MGMT_FEE_INVOICE";

export type EventUrgency = "ok" | "warning" | "critical";

export interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  date: string; // "YYYY-MM-DD"
  propertyId: string;
  propertyName: string;
  unitName?: string;
  link: string;
  daysUntil: number;
  urgency: EventUrgency;
}

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function urgency(type: EventType, daysUntil: number): EventUrgency {
  if (type === "LEASE_EXPIRY" || type === "INSURANCE_RENEWAL" || type === "COMPLIANCE_EXPIRY") {
    if (daysUntil <= 7) return "critical";
    if (daysUntil <= 30) return "warning";
    return "ok";
  }
  if (type === "MAINTENANCE_DUE" || type === "RECURRING_EXPENSE") {
    return daysUntil < 0 ? "critical" : "ok";
  }
  if (type === "RENT_REMITTANCE" || type === "MGMT_FEE_INVOICE") {
    return daysUntil === 0 ? "critical" : "ok";
  }
  return "ok";
}

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds || propertyIds.length === 0) {
    return Response.json({ events: [] });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return Response.json({ error: "Invalid year or month" }, { status: 400 });
  }

  const from = startOfMonth(new Date(year, month - 1, 1));
  const to = endOfMonth(from);
  const today = new Date();

  const [
    tenants,
    maintenanceSchedules,
    insurancePolicies,
    complianceCerts,
    recurringExpenses,
    agreements,
  ] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        isActive: true,
        unit: { propertyId: { in: propertyIds } },
        OR: [
          { leaseEnd: { gte: from, lte: to } },
          { leaseStart: { gte: from, lte: to } },
        ],
      },
      include: {
        unit: { include: { property: { select: { id: true, name: true } } } },
      },
    }),
    prisma.assetMaintenanceSchedule.findMany({
      where: {
        isActive: true,
        nextDue: { gte: from, lte: to },
        OR: [
          { propertyId: { in: propertyIds } },
          { asset: { propertyId: { in: propertyIds } } },
        ],
      },
      include: {
        property: { select: { id: true, name: true } },
        asset: { include: { property: { select: { id: true, name: true } } } },
      },
    }),
    prisma.insurancePolicy.findMany({
      where: {
        propertyId: { in: propertyIds },
        endDate: { gte: from, lte: to },
      },
      include: { property: { select: { id: true, name: true } } },
    }),
    prisma.complianceCertificate.findMany({
      where: {
        propertyId: { in: propertyIds },
        expiryDate: { gte: from, lte: to },
      },
      include: { property: { select: { id: true, name: true } } },
    }),
    prisma.recurringExpense.findMany({
      where: {
        isActive: true,
        nextDueDate: { gte: from, lte: to },
        OR: [
          { propertyId: { in: propertyIds } },
          { unit: { propertyId: { in: propertyIds } } },
        ],
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { include: { property: { select: { id: true, name: true } } } },
      },
    }),
    prisma.managementAgreement.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { id: true, name: true } } },
    }),
  ]);

  const events: CalendarEvent[] = [];

  // Lease expiry + lease start
  for (const t of tenants) {
    const prop = t.unit.property;
    if (t.leaseEnd) {
      const leaseEnd = new Date(t.leaseEnd);
      if (leaseEnd >= from && leaseEnd <= to) {
        const days = differenceInDays(leaseEnd, today);
        events.push({
          id: `lease-expiry-${t.id}`,
          type: "LEASE_EXPIRY",
          title: `${t.name} — lease expires`,
          date: toDateStr(leaseEnd),
          propertyId: prop.id,
          propertyName: prop.name,
          unitName: t.unit.unitNumber,
          link: "/tenants",
          daysUntil: days,
          urgency: urgency("LEASE_EXPIRY", days),
        });
      }
    }
    const leaseStart = new Date(t.leaseStart);
    if (leaseStart >= from && leaseStart <= to) {
      const days = differenceInDays(leaseStart, today);
      events.push({
        id: `lease-start-${t.id}`,
        type: "LEASE_START",
        title: `${t.name} — lease starts`,
        date: toDateStr(leaseStart),
        propertyId: prop.id,
        propertyName: prop.name,
        unitName: t.unit.unitNumber,
        link: "/tenants",
        daysUntil: days,
        urgency: urgency("LEASE_START", days),
      });
    }
  }

  // Maintenance schedules
  for (const s of maintenanceSchedules) {
    if (!s.nextDue) continue;
    const prop = s.property ?? s.asset?.property;
    if (!prop) continue;
    const due = new Date(s.nextDue);
    const days = differenceInDays(due, today);
    events.push({
      id: `maintenance-${s.id}`,
      type: "MAINTENANCE_DUE",
      title: s.taskName,
      date: toDateStr(due),
      propertyId: prop.id,
      propertyName: prop.name,
      link: "/maintenance",
      daysUntil: days,
      urgency: urgency("MAINTENANCE_DUE", days),
    });
  }

  // Insurance renewals
  for (const p of insurancePolicies) {
    const end = new Date(p.endDate);
    const days = differenceInDays(end, today);
    events.push({
      id: `insurance-${p.id}`,
      type: "INSURANCE_RENEWAL",
      title: `${p.insurer} — ${p.type.toLowerCase().replace("_", " ")} policy ends`,
      date: toDateStr(end),
      propertyId: p.property.id,
      propertyName: p.property.name,
      link: "/insurance",
      daysUntil: days,
      urgency: urgency("INSURANCE_RENEWAL", days),
    });
  }

  // Compliance certificates
  for (const c of complianceCerts) {
    if (!c.expiryDate) continue;
    const exp = new Date(c.expiryDate);
    const days = differenceInDays(exp, today);
    events.push({
      id: `compliance-${c.id}`,
      type: "COMPLIANCE_EXPIRY",
      title: `${c.certificateType} — expires`,
      date: toDateStr(exp),
      propertyId: c.property.id,
      propertyName: c.property.name,
      link: "/compliance/certificates",
      daysUntil: days,
      urgency: urgency("COMPLIANCE_EXPIRY", days),
    });
  }

  // Recurring expenses
  for (const r of recurringExpenses) {
    const prop = r.property ?? r.unit?.property;
    if (!prop) continue;
    const due = new Date(r.nextDueDate);
    const days = differenceInDays(due, today);
    events.push({
      id: `recurring-${r.id}`,
      type: "RECURRING_EXPENSE",
      title: `${r.description} (${r.frequency.toLowerCase()})`,
      date: toDateStr(due),
      propertyId: prop.id,
      propertyName: prop.name,
      link: "/recurring-expenses",
      daysUntil: days,
      urgency: urgency("RECURRING_EXPENSE", days),
    });
  }

  // Management agreement day-of-month events
  for (const a of agreements) {
    const remitDay = a.rentRemittanceDay;
    const invoiceDay = a.mgmtFeeInvoiceDay;
    const daysInMonth = to.getDate();

    if (remitDay >= 1 && remitDay <= daysInMonth) {
      const remitDate = new Date(year, month - 1, remitDay);
      const days = differenceInDays(remitDate, today);
      events.push({
        id: `remittance-${a.id}-${year}-${month}`,
        type: "RENT_REMITTANCE",
        title: "Rent remittance due",
        date: toDateStr(remitDate),
        propertyId: a.property.id,
        propertyName: a.property.name,
        link: `/properties/${a.property.id}/agreement`,
        daysUntil: days,
        urgency: urgency("RENT_REMITTANCE", days),
      });
    }

    if (invoiceDay >= 1 && invoiceDay <= daysInMonth) {
      const invoiceDate = new Date(year, month - 1, invoiceDay);
      const days = differenceInDays(invoiceDate, today);
      events.push({
        id: `mgmtfee-${a.id}-${year}-${month}`,
        type: "MGMT_FEE_INVOICE",
        title: "Mgmt fee invoice due",
        date: toDateStr(invoiceDate),
        propertyId: a.property.id,
        propertyName: a.property.name,
        link: `/properties/${a.property.id}/agreement`,
        daysUntil: days,
        urgency: urgency("MGMT_FEE_INVOICE", days),
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return Response.json({ events, year, month });
}
