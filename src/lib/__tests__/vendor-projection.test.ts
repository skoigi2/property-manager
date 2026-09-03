import { describe, it, expect } from "vitest";
import { projectVendorForRole, normalizeVendorName, vendorReadIsTrimmed } from "@/lib/vendor-projection";

const full = {
  id: "v1",
  name: "Acme Plumbing",
  category: "CONTRACTOR",
  phone: "0700",
  email: "a@b.c",
  taxId: "P0512",
  bankDetails: "KCB 1234567",
  notes: "n",
  isActive: true,
  _count: { expenses: 3 },
};

describe("projectVendorForRole", () => {
  it("strips financial + contact fields for CARETAKER", () => {
    const v = projectVendorForRole(full, "CARETAKER");
    expect(v).toEqual({ id: "v1", name: "Acme Plumbing", category: "CONTRACTOR", phone: "0700", isActive: true });
    expect(Object.keys(v)).not.toContain("bankDetails");
    expect(Object.keys(v)).not.toContain("taxId");
    expect(Object.keys(v)).not.toContain("email");
  });

  it("passes the record through untouched for every other role", () => {
    for (const r of ["ADMIN", "MANAGER", "ACCOUNTANT", undefined]) {
      expect(projectVendorForRole(full, r)).toBe(full);
      expect(vendorReadIsTrimmed(r)).toBe(false);
    }
  });
});

describe("normalizeVendorName", () => {
  it("is case-, whitespace- and punctuation-insensitive", () => {
    expect(normalizeVendorName("  Acme,  Ltd. ")).toBe("acme ltd");
    expect(normalizeVendorName("ACME LTD")).toBe("acme ltd");
    expect(normalizeVendorName("Acme-Ltd")).toBe("acme ltd");
  });

  it("does not collapse genuinely different names", () => {
    expect(normalizeVendorName("Acme Plumbing")).not.toBe(normalizeVendorName("Acme Electrical"));
  });
});
