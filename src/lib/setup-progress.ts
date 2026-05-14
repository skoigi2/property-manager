import { prisma } from "@/lib/prisma";

export type SetupItemKey =
  | "property"
  | "units"
  | "tenants"
  | "recurring_expenses"
  | "insurance"
  | "vendors"
  | "tenant_portal"
  | "agreement"
  | "branding"
  | "first_entry";

export interface SetupItem {
  key: SetupItemKey;
  label: string;
  done: boolean;
  severity: "done" | "warn" | "info";
  ctaLabel: string;
  ctaHref: string;
  hint?: string;
  applicable: boolean;
}

export interface SetupProgress {
  propertyId: string;
  propertyName: string;
  propertyType: "LONGTERM" | "AIRBNB";
  percent: number;
  completedCount: number;
  totalCount: number;
  items: SetupItem[];
}

export async function computeSetupProgress(propertyId: string): Promise<SetupProgress | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      type: true,
      organizationId: true,
      _count: { select: { units: true } },
    },
  });
  if (!property) return null;

  const orgId = property.organizationId;
  const isLongTerm = property.type === "LONGTERM";

  const [
    activeTenantsCount,
    portalTenantsCount,
    recurringCount,
    insuranceCount,
    vendorsCount,
    agreement,
    org,
    incomeCount,
    expenseCount,
  ] = await Promise.all([
    prisma.tenant.count({
      where: { isActive: true, unit: { propertyId } },
    }),
    prisma.tenant.count({
      where: { isActive: true, unit: { propertyId }, portalToken: { not: null } },
    }),
    prisma.recurringExpense.count({
      where: { propertyId, isActive: true },
    }),
    prisma.insurancePolicy.count({
      where: { propertyId },
    }),
    orgId
      ? prisma.vendor.count({ where: { organizationId: orgId, isActive: true } })
      : Promise.resolve(0),
    prisma.managementAgreement.findUnique({ where: { propertyId }, select: { id: true } }),
    orgId
      ? prisma.organization.findUnique({
          where: { id: orgId },
          select: {
            logoUrl: true,
            bankAccountNumber: true,
            mpesaPaybill: true,
            mpesaTill: true,
          },
        })
      : Promise.resolve(null),
    prisma.incomeEntry.count({ where: { unit: { propertyId } } }),
    prisma.expenseEntry.count({
      where: { OR: [{ propertyId }, { unit: { propertyId } }] },
    }),
  ]);

  const hasUnits = property._count.units > 0;
  const hasTenants = activeTenantsCount > 0;
  const hasPortal = portalTenantsCount > 0;
  const hasRecurring = recurringCount > 0;
  const hasInsurance = insuranceCount > 0;
  const hasVendors = vendorsCount > 0;
  const hasAgreement = !!agreement;
  const hasBranding =
    !!org && !!org.logoUrl && !!(org.bankAccountNumber || org.mpesaPaybill || org.mpesaTill);
  const hasEntry = incomeCount + expenseCount > 0;

  const items: SetupItem[] = [
    {
      key: "property",
      label: "Property created",
      done: true,
      severity: "done",
      ctaLabel: "View property",
      ctaHref: "/properties",
      applicable: true,
    },
    {
      key: "units",
      label: "Add units",
      done: hasUnits,
      severity: hasUnits ? "done" : "warn",
      ctaLabel: "Add units",
      ctaHref: "/properties",
      hint: "Units are the rentable spaces inside this property.",
      applicable: true,
    },
    {
      key: "tenants",
      label: "Add your first tenant",
      done: hasTenants,
      severity: hasTenants ? "done" : "warn",
      ctaLabel: "Add tenant",
      ctaHref: "/tenants",
      hint: "Tenants drive rent collection, invoicing, and lease tracking.",
      applicable: isLongTerm,
    },
    {
      key: "tenant_portal",
      label: "Enable a tenant portal link",
      done: hasPortal,
      severity: hasPortal ? "done" : "warn",
      ctaLabel: "Generate link",
      ctaHref: "/tenants",
      hint: "Tenants can view invoices, pay rent, and submit maintenance requests.",
      applicable: isLongTerm,
    },
    {
      key: "recurring_expenses",
      label: "Set up recurring expenses",
      done: hasRecurring,
      severity: hasRecurring ? "done" : "warn",
      ctaLabel: "Add recurring",
      ctaHref: "/recurring-expenses",
      hint: "Auto-create monthly costs like security, internet, or service charges.",
      applicable: true,
    },
    {
      key: "insurance",
      label: "Record an insurance policy",
      done: hasInsurance,
      severity: hasInsurance ? "done" : "warn",
      ctaLabel: "Add policy",
      ctaHref: "/insurance",
      hint: "Track building & liability cover with expiry reminders.",
      applicable: true,
    },
    {
      key: "vendors",
      label: "Register your vendors",
      done: hasVendors,
      severity: hasVendors ? "done" : "warn",
      ctaLabel: "Add vendor",
      ctaHref: "/vendors",
      hint: "Contractors and suppliers you pay regularly.",
      applicable: true,
    },
    {
      key: "agreement",
      label: "Save the management agreement",
      done: hasAgreement,
      severity: hasAgreement ? "done" : "warn",
      ctaLabel: "Configure",
      ctaHref: `/properties/${propertyId}/agreement`,
      hint: "Sets KPI targets, SLA hours, and fee structure.",
      applicable: true,
    },
    {
      key: "branding",
      label: "Add logo & payment details",
      done: hasBranding,
      severity: hasBranding ? "done" : "warn",
      ctaLabel: "Open settings",
      ctaHref: "/settings",
      hint: "Shown on invoices and the tenant portal.",
      applicable: true,
    },
    {
      key: "first_entry",
      label: "Log your first income or expense",
      done: hasEntry,
      severity: hasEntry ? "done" : "warn",
      ctaLabel: "Log income",
      ctaHref: "/income",
      hint: "Get your first numbers flowing into reports.",
      applicable: true,
    },
  ];

  const applicable = items.filter((i) => i.applicable);
  const completedCount = applicable.filter((i) => i.done).length;
  const totalCount = applicable.length;
  const percent = totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100);

  return {
    propertyId: property.id,
    propertyName: property.name,
    propertyType: property.type as "LONGTERM" | "AIRBNB",
    percent,
    completedCount,
    totalCount,
    items,
  };
}
