import { describe, it, expect } from "vitest";
import { ASSET_DOCUMENT_CATEGORIES, isAssetDocumentCategory, warrantyLifecycle } from "@/lib/asset-documents";
import { documentStoragePath, isAllowedDocumentFile, isLegacyPublicUrl, sortDocumentsByCategory } from "@/lib/document-files";

describe("asset document categories", () => {
  it("accepts every declared category and nothing else", () => {
    for (const c of ASSET_DOCUMENT_CATEGORIES) expect(isAssetDocumentCategory(c.value)).toBe(true);
    expect(isAssetDocumentCategory("VALUATION_REPORT")).toBe(false);
    expect(isAssetDocumentCategory(null)).toBe(false);
  });
});

describe("shared document file rules", () => {
  it("allows PDFs, images and Office files; rejects executables", () => {
    expect(isAllowedDocumentFile({ type: "application/pdf", name: "manual.pdf" })).toBe(true);
    expect(isAllowedDocumentFile({ type: "", name: "plate.HEIC" })).toBe(true);
    expect(isAllowedDocumentFile({ type: "application/x-msdownload", name: "setup.exe" })).toBe(false);
  });
  it("builds a safe bucket path under the record", () => {
    expect(documentStoragePath("assets", "a1", "Service report (Q3).pdf", 7)).toBe("assets/a1/7-Service_report__Q3_.pdf");
  });
  it("tells legacy public URLs from private bucket paths", () => {
    expect(isLegacyPublicUrl("https://x.supabase.co/storage/v1/object/public/property-documents/assets/a/b.pdf")).toBe(true);
    expect(isLegacyPublicUrl("assets/a1/7-b.pdf")).toBe(false);
  });
  it("sorts by the given category order, then newest first", () => {
    const docs = sortDocumentsByCategory([
      { id: "a", category: "OTHER", uploadedAt: "2026-01-03" },
      { id: "b", category: "WARRANTY", uploadedAt: "2026-01-01" },
      { id: "c", category: "WARRANTY", uploadedAt: "2026-02-01" },
    ], ["WARRANTY", "OTHER"]);
    expect(docs.map((d) => d.id)).toEqual(["c", "b", "a"]);
  });
});

describe("warrantyLifecycle", () => {
  const today = new Date("2026-09-05T10:00:00Z");
  it("classifies none / expired / expiring / valid", () => {
    expect(warrantyLifecycle(null, today).status).toBe("none");
    expect(warrantyLifecycle("2026-09-01", today).status).toBe("expired");
    expect(warrantyLifecycle("2026-11-01", today).status).toBe("expiring");
    expect(warrantyLifecycle("2027-09-01", today).status).toBe("valid");
  });
  it("counts today as day zero, still under warranty", () => {
    expect(warrantyLifecycle("2026-09-05", today)).toEqual({ status: "expiring", daysLeft: 0 });
  });
});
