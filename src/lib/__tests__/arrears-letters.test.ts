import { describe, it, expect } from "vitest";
import { getArrearsLetters, allArrearsLetters, type LetterContext } from "../arrears-letters";

const base: LetterContext = { tenantName: "Grace Achieng", unitNumber: "C2", propertyName: "Losai Court", amount: "KES 18,000", today: "7 Oct 2026" };
const owner: LetterContext = { ...base, isUnitOwner: true };

describe("arrears letters", () => {
  it("keeps the tenant wording unchanged", () => {
    const [notice] = getArrearsLetters("formal_notice");
    expect(notice.subject(base)).toBe("Rent arrears notice — Unit C2, Losai Court");
    expect(notice.body(base)).toContain("NOTICE OF RENT ARREARS");
    expect(getArrearsLetters("legal_action")[0].body(base)).toContain("your tenancy is in breach");
    expect(getArrearsLetters("eviction").map((l) => l.key)).toEqual(["notice_to_vacate"]);
  });

  it("words a unit owner's letters as service charge, never rent, tenancy or lease", () => {
    // Every letter an owner can be sent, stage by stage.
    const sent = allArrearsLetters().filter((l) => getArrearsLetters(stageOf(l.key), { isUnitOwner: true }).some((x) => x.key === l.key));
    expect(sent.map((l) => l.key)).toEqual(["formal_notice", "demand_letter", "notice_to_remedy"]);
    for (const l of sent) {
      const text = `${l.subject(owner)}\n${l.body(owner)}`;
      expect(text).toMatch(/service charge/i);
      expect(text).not.toMatch(/\b(rent|tenancy|lease)\b/i);
    }
    expect(getArrearsLetters("formal_notice", { isUnitOwner: true })[0].subject(owner)).toBe("Service charge arrears notice — Unit C2, Losai Court");
  });

  it("never offers a unit owner a notice to vacate", () => {
    expect(getArrearsLetters("eviction", { isUnitOwner: true })).toEqual([]);
  });
});

function stageOf(letterKey: string): string {
  return { formal_notice: "formal_notice", demand_letter: "demand_letter", notice_to_remedy: "legal_action", notice_to_vacate: "eviction" }[letterKey] ?? "";
}
