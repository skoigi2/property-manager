/**
 * Recording preconditions for `rent-increases`.
 *
 * Same Kenyan org as `utilities-metering` (guide-utilities@groundworkpm.com,
 * "Nairobi Homes Management", KES): seedUtilities re-creates its Kilimani Court
 * demo. Then the unit 102 tenant gets lease terms of 5% a year with the first
 * review on the 1st of a month whose 90-day notice deadline falls within the
 * next 30 days — so the review is "upcoming" — and the reminder the daily cron
 * would raise is written straight away (same fields as checkRentIncreasesDue),
 * so the Inbox scene doesn't depend on the cron.
 */
import type { PrismaClient } from "@prisma/client";
import { seedUtilities, UTILITIES_RECORD_EMAIL } from "./seed-utilities";
import { nextRentReview } from "../../src/lib/rent-escalation";
import { formatCurrency } from "../../src/lib/currency";
import { formatDate } from "../../src/lib/date-utils";

export const REVIEW_UNIT = "102";
const NOTICE_DAYS = 90;

/** The 1st of the first month whose notice deadline is 1–30 days away. */
function reviewAnchor(today: Date): Date {
  for (let m = 2; m < 8; m++) {
    // UTC midnight, like a date typed into the tenant form (the edit form
    // prefills from the ISO date, so a local-midnight value would show a day early).
    const anchor = new Date(Date.UTC(today.getFullYear(), today.getMonth() + m, 1));
    const deadline = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - NOTICE_DAYS);
    const days = Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
    if (days >= 1 && days <= 30) return anchor;
  }
  throw new Error("No review date fits the reminder window");
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function seedRentIncreases(prisma: PrismaClient, fixturesDir: string): Promise<void> {
  await seedUtilities(prisma, fixturesDir);

  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL }, select: { organizationId: true } });
  const property = await prisma.property.findFirst({
    where: { organizationId: user!.organizationId!, name: "Kilimani Court" },
    select: { id: true, name: true, currency: true, organizationId: true },
  });
  if (!property) throw new Error("Kilimani Court not found after seeding");
  const tenant = await prisma.tenant.findFirst({
    where: { isActive: true, unit: { propertyId: property.id, unitNumber: REVIEW_UNIT } },
    select: { id: true, name: true, unitId: true, leaseStart: true, monthlyRent: true, rentHistory: { select: { monthlyRent: true, effectiveDate: true, appliedAt: true } } },
  });
  if (!tenant) throw new Error(`No active tenant in unit ${REVIEW_UNIT}`);

  const today = new Date();
  const anchor = reviewAnchor(today);
  const leaseEnd = new Date(Date.UTC(anchor.getUTCFullYear() + 2, anchor.getUTCMonth(), 0));
  await prisma.managementAgreement.updateMany({ where: { propertyId: property.id }, data: { rentIncreaseNoticeDays: NOTICE_DAYS } });
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      escalationType: "PERCENT",
      escalationRate: 5,
      escalationAmount: null,
      escalationIntervalYears: 1,
      escalationAnchorDate: anchor,
      escalationNoticeDays: null,
      leaseEnd,
    },
  });

  const review = nextRentReview(
    {
      leaseStart: tenant.leaseStart,
      leaseEnd,
      escalationType: "PERCENT",
      escalationRate: 5,
      escalationAmount: null,
      escalationIntervalYears: 1,
      escalationAnchorDate: anchor,
    },
    tenant.rentHistory.map((h) => ({ monthlyRent: Number(h.monthlyRent), effectiveDate: h.effectiveDate, appliedAt: h.appliedAt })),
    Number(tenant.monthlyRent),
    NOTICE_DAYS,
    today,
  );
  if (!review || review.state !== "upcoming") throw new Error(`Expected an upcoming review, got ${review?.state ?? "none"}`);

  const fmt = (n: number) => formatCurrency(n, property.currency);
  await prisma.actionableHint.deleteMany({ where: { hintType: "RENT_INCREASE_DUE", propertyId: property.id } });
  await prisma.actionableHint.create({
    data: {
      organizationId: property.organizationId!,
      propertyId: property.id,
      unitId: tenant.unitId,
      tenantId: tenant.id,
      hintType: "RENT_INCREASE_DUE",
      refId: `${tenant.id}:${ymd(review.reviewDate)}`,
      severity: "WARNING",
      status: "ACTIVE",
      title: `Rent increase due — ${tenant.name}`,
      subtitle: `${property.name} · Unit ${REVIEW_UNIT} · review ${formatDate(review.reviewDate)} · ${fmt(review.baseRent)} → ${fmt(review.proposedRent)} · send notice by ${formatDate(review.noticeDeadline)}`,
      suggestedAction: "Confirm the new rent and send the notice",
      actionEndpoint: `/tenants/${tenant.id}?tab=history`,
      actionMethod: "GET",
      actionLabel: "Review increase",
      expiresAt: review.reviewDate,
    },
  });
  console.log(`  ✓ rent review: ${tenant.name} (unit ${REVIEW_UNIT}) ${fmt(review.baseRent)} → ${fmt(review.proposedRent)} on ${formatDate(review.reviewDate)}, notice by ${formatDate(review.noticeDeadline)}`);
}
