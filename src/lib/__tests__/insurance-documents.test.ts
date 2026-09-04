import { describe, it, expect } from "vitest";
import {
  INSURANCE_DOCUMENT_CATEGORIES,
  isInsuranceDocumentCategory,
  isAllowedInsuranceDocument,
  isLegacyPublicUrl,
  insuranceStoragePath,
  sortInsuranceDocuments,
  policyLifecycle,
  renewalDates,
} from "@/lib/insurance-documents";

describe("insurance document categories", () => {
  it("accepts every declared category and nothing else", () => {
    for (const c of INSURANCE_DOCUMENT_CATEGORIES) expect(isInsuranceDocumentCategory(c.value)).toBe(true);
    expect(isInsuranceDocumentCategory("RECEIPT")).toBe(false);
    expect(isInsuranceDocumentCategory(undefined)).toBe(false);
  });

  it("allows PDFs, images and Office files; rejects executables — by extension when the MIME type is empty", () => {
    expect(isAllowedInsuranceDocument({ type: "application/pdf", name: "valuation.pdf" })).toBe(true);
    expect(isAllowedInsuranceDocument({ type: "", name: "IMG_0001.HEIC" })).toBe(true);
    expect(isAllowedInsuranceDocument({ type: "", name: "schedule.xlsx" })).toBe(true);
    expect(isAllowedInsuranceDocument({ type: "application/x-msdownload", name: "setup.exe" })).toBe(false);
    expect(isAllowedInsuranceDocument({ type: "", name: "notes.txt" })).toBe(false);
  });

  it("tells legacy public URLs from private bucket paths", () => {
    expect(isLegacyPublicUrl("https://x.supabase.co/storage/v1/object/public/property-documents/insurance/a/b.pdf")).toBe(true);
    expect(isLegacyPublicUrl("insurance/abc/1700000000-b.pdf")).toBe(false);
  });

  it("builds a safe bucket path under the policy", () => {
    expect(insuranceStoragePath("pol1", "My Report (final).pdf", 42)).toBe("insurance/pol1/42-My_Report__final_.pdf");
  });

  it("sorts by category order, then newest first", () => {
    const docs = sortInsuranceDocuments([
      { id: "a", category: "OTHER", uploadedAt: "2026-01-03" },
      { id: "b", category: "VALUATION_REPORT", uploadedAt: "2026-01-01" },
      { id: "c", category: "POLICY_SCHEDULE", uploadedAt: "2026-01-02" },
      { id: "d", category: "VALUATION_REPORT", uploadedAt: "2026-02-01" },
    ]);
    expect(docs.map((d) => d.id)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("policyLifecycle", () => {
  const today = new Date("2026-09-05T10:00:00Z");
  it("classifies expired / expiring / active / upcoming", () => {
    expect(policyLifecycle("2025-09-01", "2026-09-01", today).status).toBe("expired");
    expect(policyLifecycle("2025-10-01", "2026-10-01", today).status).toBe("expiring");
    expect(policyLifecycle("2026-01-01", "2027-01-01", today).status).toBe("active");
    expect(policyLifecycle("2026-10-01", "2027-10-01", today).status).toBe("upcoming");
  });
  it("uses the caller's amber window", () => {
    expect(policyLifecycle("2025-10-01", "2026-10-01", today, 20).status).toBe("active");
  });
  it("expires at the end date, not the day before", () => {
    expect(policyLifecycle("2025-09-05", "2026-09-05", today).status).not.toBe("expired");
    expect(policyLifecycle("2025-09-05", "2026-09-05", today).daysToEnd).toBe(0);
  });
});

describe("renewalDates", () => {
  it("starts the day after the old term ends and keeps a one-year term whole", () => {
    expect(renewalDates("2025-09-01", "2026-08-31")).toEqual({ startDate: "2026-09-01", endDate: "2027-08-31" });
    expect(renewalDates("2025-01-01", "2025-12-31")).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });
  it("treats a near-year first term as annual", () => {
    expect(renewalDates("2025-09-01", "2026-08-19")).toEqual({ startDate: "2026-08-20", endDate: "2027-08-19" });
  });
  it("preserves a shorter term's length", () => {
    expect(renewalDates("2026-01-01", "2026-03-31")).toEqual({ startDate: "2026-04-01", endDate: "2026-06-29" });
  });
});
