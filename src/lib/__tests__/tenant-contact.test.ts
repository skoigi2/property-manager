import { describe, expect, it } from "vitest";
import { isTenantUncontactable, tenantContactChannels } from "@/lib/tenant-contact";

describe("tenantContactChannels", () => {
  it("accepts a real email and a local number when the currency names the country", () => {
    expect(tenantContactChannels({ email: "faith@example.com", phone: "0712 345 678" }, "KES")).toEqual({ email: true, whatsapp: true });
  });
  it("rejects a malformed email", () => {
    expect(tenantContactChannels({ email: "faith at example", phone: null }, "KES").email).toBe(false);
  });
  it("a local number with a currency that names no country can't be used on WhatsApp", () => {
    expect(tenantContactChannels({ phone: "0712 345 678" }, "USD").whatsapp).toBe(false);
    expect(tenantContactChannels({ phone: "+254 712 345 678" }, "USD").whatsapp).toBe(true);
  });
});

describe("isTenantUncontactable", () => {
  it("only when both channels are missing", () => {
    expect(isTenantUncontactable({ email: null, phone: null }, "KES")).toBe(true);
    expect(isTenantUncontactable({ email: "", phone: "n/a" }, "KES")).toBe(true);
    expect(isTenantUncontactable({ email: "a@b.co", phone: null }, "KES")).toBe(false);
    expect(isTenantUncontactable({ email: null, phone: "0712345678" }, "KES")).toBe(false);
  });
});
