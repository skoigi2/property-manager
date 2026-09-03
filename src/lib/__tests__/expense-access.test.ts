import { describe, it, expect } from "vitest";
import { decideExpenseMutation, orgMismatch } from "@/lib/expense-rules";

const base = { isSuperAdmin: false, userId: "u-care" };
const own = { createdByUserId: "u-care", pettyCashStatus: null as null };
const theirs = { createdByUserId: "u-mgr", pettyCashStatus: null as null };
const legacy = { createdByUserId: null, pettyCashStatus: null as null };

describe("decideExpenseMutation — CARETAKER", () => {
  it("may edit / delete / attach on their own rows", () => {
    for (const action of ["edit", "delete", "attach"] as const) {
      expect(decideExpenseMutation({ ...base, orgRole: "CARETAKER", row: own, action })).toEqual({ ok: true });
    }
  });

  it("is refused on someone else's row and on legacy rows with no creator", () => {
    for (const row of [theirs, legacy]) {
      for (const action of ["edit", "delete", "attach"] as const) {
        const d = decideExpenseMutation({ ...base, orgRole: "CARETAKER", row, action });
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.status).toBe(403);
      }
    }
  });

  it("is locked out of edit/delete once the float holder APPROVED the OUT row, but may still attach", () => {
    const confirmed = { createdByUserId: "u-care", pettyCashStatus: "APPROVED" as const };
    for (const action of ["edit", "delete"] as const) {
      const d = decideExpenseMutation({ ...base, orgRole: "CARETAKER", row: confirmed, action });
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.status).toBe(409);
        expect(d.code).toBe("PETTY_CASH_CONFIRMED");
      }
    }
    expect(decideExpenseMutation({ ...base, orgRole: "CARETAKER", row: confirmed, action: "attach" })).toEqual({ ok: true });
  });

  it("may still fix or delete a PENDING / REJECTED own row", () => {
    for (const status of ["PENDING", "REJECTED"] as const) {
      const row = { createdByUserId: "u-care", pettyCashStatus: status };
      expect(decideExpenseMutation({ ...base, orgRole: "CARETAKER", row, action: "edit" })).toEqual({ ok: true });
      expect(decideExpenseMutation({ ...base, orgRole: "CARETAKER", row, action: "delete" })).toEqual({ ok: true });
    }
  });
});

describe("decideExpenseMutation — established roles", () => {
  it("ACCOUNTANT keeps the FINANCIAL_DELETE 403 but may edit anyone's row", () => {
    const d = decideExpenseMutation({ ...base, orgRole: "ACCOUNTANT", row: theirs, action: "delete" });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(403);
      expect(d.code).toBe("PERMISSION_DENIED");
    }
    expect(decideExpenseMutation({ ...base, orgRole: "ACCOUNTANT", row: theirs, action: "edit" })).toEqual({ ok: true });
  });

  it("MANAGER / ADMIN act on any row, confirmed or not", () => {
    const confirmed = { createdByUserId: null, pettyCashStatus: "APPROVED" as const };
    for (const orgRole of ["MANAGER", "ADMIN"]) {
      for (const action of ["edit", "delete", "attach"] as const) {
        expect(decideExpenseMutation({ ...base, orgRole, row: confirmed, action })).toEqual({ ok: true });
      }
    }
  });

  it("super-admin bypasses everything", () => {
    expect(decideExpenseMutation({ ...base, isSuperAdmin: true, orgRole: "CARETAKER", row: theirs, action: "delete" })).toEqual({ ok: true });
  });
});

describe("orgMismatch", () => {
  it("only flags a different, non-null org on both sides", () => {
    expect(orgMismatch("a", "b")).toBe(true);
    expect(orgMismatch("a", "a")).toBe(false);
    expect(orgMismatch(null, "a")).toBe(false);
    expect(orgMismatch("a", null)).toBe(false);
  });
});
