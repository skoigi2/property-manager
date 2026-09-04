import { describe, it, expect } from "vitest";
import { isRoleAllowed, MANAGER_ROLES, ESTABLISHED_ROLES, OPS_ROLES } from "@/lib/roles";
import { resolvePettyCashOutStatus, reevaluatePettyCashOutStatus } from "@/lib/petty-cash-status";
import { hintTypesVisibleTo } from "@/lib/hint-visibility";
import { seatPoolForRole, hasSeatCapacity } from "@/lib/subscription";

const ALL = ["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER", "CARETAKER"] as const;

describe("isRoleAllowed (allow-list semantics)", () => {
  it("MANAGER_ROLES admits exactly the manager tier", () => {
    const expected: Record<string, boolean> = { ADMIN: true, MANAGER: true, ACCOUNTANT: true, OWNER: false, CARETAKER: false };
    for (const r of ALL) expect(isRoleAllowed(r, MANAGER_ROLES, false)).toBe(expected[r]);
  });

  it("ESTABLISHED_ROLES admits every pre-CARETAKER role and nothing new", () => {
    const expected: Record<string, boolean> = { ADMIN: true, MANAGER: true, ACCOUNTANT: true, OWNER: true, CARETAKER: false };
    for (const r of ALL) expect(isRoleAllowed(r, ESTABLISHED_ROLES, false)).toBe(expected[r]);
  });

  it("OPS_ROLES admits CARETAKER but never OWNER", () => {
    const expected: Record<string, boolean> = { ADMIN: true, MANAGER: true, ACCOUNTANT: true, OWNER: false, CARETAKER: true };
    for (const r of ALL) expect(isRoleAllowed(r, OPS_ROLES, false)).toBe(expected[r]);
  });

  it("unknown or missing roles are denied; super-admin always passes", () => {
    expect(isRoleAllowed("SOMETHING_NEW", ESTABLISHED_ROLES, false)).toBe(false);
    expect(isRoleAllowed(undefined, ESTABLISHED_ROLES, false)).toBe(false);
    expect(isRoleAllowed("", MANAGER_ROLES, false)).toBe(false);
    expect(isRoleAllowed(undefined, MANAGER_ROLES, true)).toBe(true);
    expect(isRoleAllowed("OWNER", MANAGER_ROLES, true)).toBe(true);
  });
});

describe("resolvePettyCashOutStatus", () => {
  it("CARETAKER rows are always PENDING", () => {
    expect(resolvePettyCashOutStatus({ orgRole: "CARETAKER", amount: 1, repairAuthorityLimit: null })).toBe("PENDING");
    expect(resolvePettyCashOutStatus({ orgRole: "CARETAKER", amount: 1, repairAuthorityLimit: 1000 })).toBe("PENDING");
  });

  it("managers follow the repair-authority threshold when one is supplied", () => {
    expect(resolvePettyCashOutStatus({ orgRole: "MANAGER", amount: 500, repairAuthorityLimit: 1000 })).toBe("APPROVED");
    expect(resolvePettyCashOutStatus({ orgRole: "MANAGER", amount: 1500, repairAuthorityLimit: 1000 })).toBe("PENDING");
    expect(resolvePettyCashOutStatus({ orgRole: "MANAGER", amount: 1000, repairAuthorityLimit: 1000 })).toBe("APPROVED");
  });

  it("no threshold → APPROVED for non-caretakers (expense-path behaviour unchanged)", () => {
    expect(resolvePettyCashOutStatus({ orgRole: "MANAGER", amount: 99999, repairAuthorityLimit: null })).toBe("APPROVED");
    expect(resolvePettyCashOutStatus({ orgRole: undefined, amount: 99999, repairAuthorityLimit: undefined })).toBe("APPROVED");
  });
});

describe("hintTypesVisibleTo", () => {
  it("hides LOW_PETTY_CASH (and every other finance hint) from CARETAKER", () => {
    const visible = hintTypesVisibleTo("CARETAKER");
    expect(visible).not.toBe("ALL");
    if (visible !== "ALL") {
      expect(visible).not.toContain("LOW_PETTY_CASH");
      expect(visible).not.toContain("INVOICE_OVERDUE");
      expect(visible).toContain("URGENT_OPEN_4H");
    }
  });

  it("everyone else sees everything", () => {
    for (const r of ["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER", undefined]) {
      expect(hintTypesVisibleTo(r)).toBe("ALL");
    }
  });
});

describe("seat pools", () => {
  it("CARETAKER consumes a caretaker seat, every other role a team seat", () => {
    expect(seatPoolForRole("CARETAKER")).toBe("CARETAKER");
    for (const r of ["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER", undefined, null]) {
      expect(seatPoolForRole(r)).toBe("TEAM");
    }
  });

  it("STARTER: one team seat but two caretaker seats", () => {
    expect(hasSeatCapacity("TEAM", "STARTER", 1)).toBe(false);
    expect(hasSeatCapacity("CARETAKER", "STARTER", 0)).toBe(true);
    expect(hasSeatCapacity("CARETAKER", "STARTER", 1)).toBe(true);
    expect(hasSeatCapacity("CARETAKER", "STARTER", 2)).toBe(false);
    expect(hasSeatCapacity("CARETAKER", "PRO", 500)).toBe(true);
  });
});

describe("reevaluatePettyCashOutStatus (linked OUT row edited from the expense form)", () => {
  const limit = 1000;
  it("caretaker edits always resubmit as PENDING with approval cleared", () => {
    expect(reevaluatePettyCashOutStatus({ orgRole: "CARETAKER", currentStatus: "REJECTED", amountChanged: false, amount: 10, repairAuthorityLimit: limit }))
      .toEqual({ status: "PENDING", clearApproval: true });
  });
  it("manager: no amount change → no status change, even above the limit", () => {
    expect(reevaluatePettyCashOutStatus({ orgRole: "MANAGER", currentStatus: "APPROVED", amountChanged: false, amount: 5000, repairAuthorityLimit: limit })).toBeNull();
  });
  it("manager: amount raised over the limit un-approves the row", () => {
    expect(reevaluatePettyCashOutStatus({ orgRole: "MANAGER", currentStatus: "APPROVED", amountChanged: true, amount: 5000, repairAuthorityLimit: limit }))
      .toEqual({ status: "PENDING", clearApproval: true });
  });
  it("manager: amount lowered under the limit while PENDING approves it; already approved stays", () => {
    expect(reevaluatePettyCashOutStatus({ orgRole: "MANAGER", currentStatus: "PENDING", amountChanged: true, amount: 500, repairAuthorityLimit: limit }))
      .toEqual({ status: "APPROVED", clearApproval: false });
    expect(reevaluatePettyCashOutStatus({ orgRole: "MANAGER", currentStatus: "APPROVED", amountChanged: true, amount: 500, repairAuthorityLimit: limit })).toBeNull();
  });
  it("manager: a REJECTED row is left alone; no limit → never pending", () => {
    expect(reevaluatePettyCashOutStatus({ orgRole: "MANAGER", currentStatus: "REJECTED", amountChanged: true, amount: 5000, repairAuthorityLimit: limit })).toBeNull();
    expect(reevaluatePettyCashOutStatus({ orgRole: "MANAGER", currentStatus: "APPROVED", amountChanged: true, amount: 5000, repairAuthorityLimit: null })).toBeNull();
  });
});
