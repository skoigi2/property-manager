import { describe, it, expect } from "vitest";
import { roleCan } from "@/lib/permissions";

describe("roleCan", () => {
  it("denies ACCOUNTANT the restricted actions", () => {
    expect(roleCan("ACCOUNTANT", "FINANCIAL_DELETE")).toBe(false);
    expect(roleCan("ACCOUNTANT", "TENANT_LIFECYCLE")).toBe(false);
    expect(roleCan("ACCOUNTANT", "ORG_SETTINGS")).toBe(false);
  });

  it("allows ADMIN and MANAGER everything", () => {
    for (const role of ["ADMIN", "MANAGER"]) {
      expect(roleCan(role, "FINANCIAL_DELETE")).toBe(true);
      expect(roleCan(role, "TENANT_LIFECYCLE")).toBe(true);
      expect(roleCan(role, "ORG_SETTINGS")).toBe(true);
    }
  });

  it("never restricts a missing orgRole (super-admin)", () => {
    expect(roleCan(null, "FINANCIAL_DELETE")).toBe(true);
    expect(roleCan(undefined, "ORG_SETTINGS")).toBe(true);
  });
});
