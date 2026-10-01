import { describe, it, expect } from "vitest";
import { buildWhatsAppMessage, PORTAL_LINK_REQUIRED, type WhatsAppMessageContext } from "../whatsapp-messages";
import { invoiceReminderFigures, tenantReminderFigures } from "../rent-reminder-figures";

const ctx: WhatsAppMessageContext = {
  tenantName: "Faith Chebet",
  unitNumber: "103",
  propertyName: "Kilimani Court",
  currency: "KES",
  senderName: "Nairobi Homes Management",
  outstanding: 93000,
  daysOverdue: 26,
  periodLabel: "September 2026",
  portalUrl: "https://groundworkpm.com/portal/abc",
  monthlyRent: 85000,
  serviceCharge: 8000,
  lastPayment: { amount: 93000, date: "2026-08-03T00:00:00.000Z" },
  leaseEnd: "2026-12-31T00:00:00.000Z",
  proposedRent: 90000,
  proposedLeaseEnd: "2027-12-31T00:00:00.000Z",
};

describe("rent reminder", () => {
  it("first name, unit, property, bold outstanding amount, days overdue, portal link", () => {
    const m = buildWhatsAppMessage("rent_reminder", ctx);
    expect(m).toContain("Hi Faith,");
    expect(m).toContain("Unit 103, Kilimani Court");
    expect(m).toContain("*KSh 93,000*");
    expect(m).toContain("(26 days overdue)");
    expect(m).toContain("for September 2026");
    expect(m).toContain("https://groundworkpm.com/portal/abc");
    expect(m).not.toMatch(/<[a-z]/i); // no HTML
  });

  it("no portal link line without a valid portal link; 1 day is singular", () => {
    const m = buildWhatsAppMessage("rent_reminder", { ...ctx, portalUrl: null, daysOverdue: 1 });
    expect(m).not.toContain("portal");
    expect(m).toContain("(1 day overdue)");
  });

  it("nothing outstanding reads as an upcoming reminder for the month's rent + service charge", () => {
    const m = buildWhatsAppMessage("rent_reminder", { ...ctx, outstanding: 0, daysOverdue: 0 });
    expect(m).toContain("*KSh 93,000*");
    expect(m).toContain("due this month");
    expect(m).not.toContain("overdue");
  });

  it("an unknown locale falls back to English", () => {
    expect(buildWhatsAppMessage("rent_reminder", ctx, "sw")).toBe(buildWhatsAppMessage("rent_reminder", ctx));
  });
});

describe("other templates", () => {
  it("receipt, renewal offer and expiry notice", () => {
    expect(buildWhatsAppMessage("payment_receipt", ctx)).toContain("*KSh 93,000* received on");
    const renewal = buildWhatsAppMessage("renewal_offer", ctx);
    expect(renewal).toContain("*KSh 90,000*");
    expect(renewal).toContain("31 Dec 2027");
    expect(buildWhatsAppMessage("expiry_notice", ctx)).toContain("*31 Dec 2026*");
  });
});

describe("share portal link", () => {
  it("welcomes the tenant with the link; never sent without one", () => {
    const m = buildWhatsAppMessage("portal_link", ctx);
    expect(m).toContain("Hi Faith,");
    expect(m).toContain("tenant portal for Unit 103, Kilimani Court");
    expect(m).toContain("Your link: https://groundworkpm.com/portal/abc");
    expect(PORTAL_LINK_REQUIRED.has("portal_link")).toBe(true);
    expect(PORTAL_LINK_REQUIRED.has("rent_reminder")).toBe(false);
  });
});

describe("reminder figures (shared with the email)", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  it("one invoice: unpaid part and whole days past due", () => {
    expect(invoiceReminderFigures({ totalAmount: 93000, paidAmount: 40000, dueDate: "2026-09-05T00:00:00Z" }, now))
      .toEqual({ outstanding: 53000, daysOverdue: 26 });
    expect(invoiceReminderFigures({ totalAmount: 100, paidAmount: null, dueDate: "2026-10-05T00:00:00Z" }, now))
      .toEqual({ outstanding: 100, daysOverdue: 0 });
  });
  it("several invoices: amounts add up, days overdue of the oldest unpaid", () => {
    expect(
      tenantReminderFigures(
        [
          { totalAmount: 93000, paidAmount: null, dueDate: "2026-08-05T00:00:00Z" },
          { totalAmount: 93000, paidAmount: 93000, dueDate: "2026-07-05T00:00:00Z" }, // paid — ignored
          { totalAmount: 93000, paidAmount: 0, dueDate: "2026-09-05T00:00:00Z" },
        ],
        now,
      ),
    ).toEqual({ outstanding: 186000, daysOverdue: 57 });
  });
});
