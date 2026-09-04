import { describe, it, expect } from "vitest";
import { contentsCoverCheck } from "@/lib/contents-cover";

describe("contentsCoverCheck", () => {
  it("reports no_assets when the register has no replacement values", () => {
    expect(contentsCoverCheck(150000, 0, 0).status).toBe("no_assets");
  });
  it("reports no_cover_figure when the policy has no sum insured", () => {
    const r = contentsCoverCheck(null, 120000, 4);
    expect(r.status).toBe("no_cover_figure");
    expect(r.replacementTotal).toBe(120000);
  });
  it("flags under-insurance with the shortfall", () => {
    const r = contentsCoverCheck(100000, 150000, 6);
    expect(r.status).toBe("under");
    expect(r.shortfall).toBe(50000);
    expect(r.coverRatio).toBeCloseTo(0.667, 2);
  });
  it("tolerates a 2% gap and reads over-cover as ok", () => {
    expect(contentsCoverCheck(98500, 100000, 3).status).toBe("ok");
    expect(contentsCoverCheck(97000, 100000, 3).status).toBe("under");
    expect(contentsCoverCheck(250000, 100000, 3).status).toBe("ok");
  });
});
