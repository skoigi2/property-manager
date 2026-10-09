import { describe, it, expect } from "vitest";
import { withPlatformScope } from "../auth.config";

// "ADMIN with no organisation" used to be the whole test for the platform
// super-admin — and a fresh Google sign-up is in exactly that state until it
// creates its organisation (2026-10-09). Only the flag grants it now.
describe("withPlatformScope", () => {
  it("demotes an org-less ADMIN that isn't a platform admin", () => {
    const t = withPlatformScope({ id: "u1", role: "ADMIN", orgRole: "ADMIN", organizationId: null, isPlatformAdmin: false });
    expect([t.role, t.orgRole]).toEqual(["MANAGER", "MANAGER"]);
  });

  it("demotes a token from before the flag existed", () => {
    const t = withPlatformScope({ id: "u1", role: "ADMIN", orgRole: "ADMIN", organizationId: null });
    expect(t.role).toBe("MANAGER");
  });

  it("keeps the platform admin", () => {
    const t = withPlatformScope({ id: "u1", role: "ADMIN", orgRole: "ADMIN", organizationId: null, isPlatformAdmin: true });
    expect([t.role, t.orgRole]).toEqual(["ADMIN", "ADMIN"]);
  });

  it("leaves anyone with an organisation alone", () => {
    const t = withPlatformScope({ id: "u1", role: "ADMIN", orgRole: "ADMIN", organizationId: "org1", isPlatformAdmin: false });
    expect([t.role, t.orgRole]).toEqual(["ADMIN", "ADMIN"]);
  });

  it("doesn't touch other org-less roles", () => {
    const t = withPlatformScope({ id: "u1", role: "MANAGER", orgRole: "MANAGER", organizationId: null });
    expect(t.role).toBe("MANAGER");
  });
});
