// Unit owners on a development the organisation manages: they own their
// apartment and pay only the service charge (plus any metered utilities /
// Wi-Fi) — no rent, deposit, lease end, rent reviews, renewal or letting fee.
// Modelled as a Tenant with isUnitOwner = true (the payer of the account).
// Their payments are booked as SERVICE_CHARGE income, never LONGTERM_RENT
// (src/lib/invoice-payment-entries.ts), and still count in gross income and
// the management-fee base. Pure module.

/** The fields an owner account never carries, forced on every save. */
export function unitOwnerOverrides(isUnitOwner: boolean | null | undefined) {
  if (!isUnitOwner) return {};
  return {
    monthlyRent: 0,
    depositAmount: 0,
    leaseEnd: null,
    monthToMonth: false,
    escalationRate: null,
    escalationAmount: null,
    escalationIntervalYears: null,
    escalationNoticeDays: null,
    escalationAnchorDate: null,
    renewalStage: "NONE" as const,
    proposedRent: null,
    proposedLeaseEnd: null,
  };
}

/**
 * The importers' "Account Type" cell: "Unit owner" / "Owner" → true,
 * "Tenant" → false, blank / anything else → null (leave as is on an update,
 * tenant on a create).
 */
export function parseAccountType(raw: unknown): boolean | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/owner/.test(v)) return true;
  if (/tenant/.test(v)) return false;
  return null;
}

/** What the account's regular charge is called — "Rent" for a tenant, "Service charge" for an owner. */
export function regularChargeLabel(isUnitOwner: boolean | null | undefined): string {
  return isUnitOwner ? "Service charge" : "Rent";
}
