// Deposit position: contractual vs actually received.
//
// Tenant.depositAmount is the CONTRACTUAL deposit — what the lease says should
// be held. What is actually held can only come from DEPOSIT income entries
// linked to the tenant (partial and instalment deposits are common). The two
// figures are different numbers and must never be conflated: refunds computed
// from the contractual figure can pay out cash that was never received.
//
// Verification model:
// - Tenants with at least one DEPOSIT receipt are VERIFIED: held = the sum of
//   receipts, and any gap to the contract is a real shortfall to surface.
// - Tenants with no receipt trail (onboarded before receipts were recorded,
//   or deposit taken outside the app) are UNVERIFIED: we fall back to the
//   contractual amount but flag it, rather than silently trusting it.

export type DepositVerification = "VERIFIED" | "UNVERIFIED";

export interface DepositPosition {
  /** What the lease says should be held (Tenant.depositAmount). */
  contractual: number;
  /** Sum of DEPOSIT receipts for the tenant; null when no receipt exists. */
  received: number | null;
  /** Refund/settlement base: receipts when a trail exists, else contractual. */
  held: number;
  /** contractual − received, floored at 0. Always 0 when UNVERIFIED. */
  shortfall: number;
  /** received − contractual, floored at 0 (deposit overpaid). */
  excess: number;
  verification: DepositVerification;
}

export function calcDepositPosition(
  contractual: number,
  depositEntries: { grossAmount: number }[],
): DepositPosition {
  if (depositEntries.length === 0) {
    return {
      contractual,
      received: null,
      held: contractual,
      shortfall: 0,
      excess: 0,
      verification: "UNVERIFIED",
    };
  }
  const received = depositEntries.reduce((s, e) => s + e.grossAmount, 0);
  return {
    contractual,
    received,
    held: received,
    shortfall: Math.max(contractual - received, 0),
    excess: Math.max(received - contractual, 0),
    verification: "VERIFIED",
  };
}
