import { describe, it, expect } from "vitest";
import {
  complaintVisibleTo, hiddenCategoriesFor, categoriesSelectableBy,
  decideComplaintAction, availableComplaintActions, COMPLAINT_ACTIONS, COMPLAINT_CATEGORY_LABEL,
} from "@/lib/complaint-rules";
import { WORKFLOWS, computeDefaultStageSlaHours } from "@/lib/case-workflow-defs";
import { TENANT_DIRECTORY_SELECT, TENANT_DIRECTORY_KEYS, tenantReadIsDirectory } from "@/lib/tenant-projection";
import { validateCaseAttachments, CASE_ATTACHMENT_MAX_FILES } from "@/lib/case-events";

const ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT", "OWNER", "CARETAKER"] as const;
const CATS = Object.keys(COMPLAINT_CATEGORY_LABEL);

describe("STAFF_CONDUCT visibility", () => {
  it("is hidden from CARETAKER only", () => {
    expect(complaintVisibleTo("CARETAKER", "STAFF_CONDUCT")).toBe(false);
    for (const c of CATS.filter((c) => c !== "STAFF_CONDUCT")) expect(complaintVisibleTo("CARETAKER", c)).toBe(true);
    for (const r of ROLES.filter((r) => r !== "CARETAKER")) {
      for (const c of CATS) expect(complaintVisibleTo(r, c)).toBe(true);
      expect(hiddenCategoriesFor(r)).toEqual([]);
    }
    expect(hiddenCategoriesFor("CARETAKER")).toEqual(["STAFF_CONDUCT"]);
  });

  it("caretakers cannot pick it either", () => {
    expect(categoriesSelectableBy("CARETAKER")).not.toContain("STAFF_CONDUCT");
    expect(categoriesSelectableBy("MANAGER")).toContain("STAFF_CONDUCT");
    expect(categoriesSelectableBy("MANAGER")).toHaveLength(6);
  });
});

describe("COMPLAINT_V1 workflow", () => {
  const wf = WORKFLOWS.COMPLAINT;
  it("has the six documented stages in order", () => {
    expect(wf.stages.map((s) => s.key)).toEqual(["received", "acknowledged", "investigating", "awaiting_tenant", "resolved", "closed"]);
    expect(wf.naturalCompletionIndex).toBe(1);
    expect(wf.stages[4].terminalStatus).toBe("RESOLVED");
    expect(wf.stages[5].terminalStatus).toBe("CLOSED");
    expect(wf.stages[3].requiresAction).toBe("TENANT");
  });

  it("takes the acknowledge SLA from the agreement, keeps the rest as defaults", () => {
    const base = computeDefaultStageSlaHours(wf);
    expect(base.received).toBe(24);
    expect(base.acknowledged).toBe(72);
    expect(base.investigating).toBe(120);
    const withAgreement = computeDefaultStageSlaHours(wf, { agreement: { kpiEmergencyResponseHrs: 4, kpiStandardResponseHrs: 48 } });
    expect(withAgreement.received).toBe(48);
    expect(withAgreement.acknowledged).toBe(72);
    // MAINTENANCE branch must not bleed in
    expect(withAgreement.triaged).toBeUndefined();
  });

  it("every action targets a real stage", () => {
    for (const a of Object.values(COMPLAINT_ACTIONS)) expect(wf.stages.some((s) => s.key === a.toStage)).toBe(true);
  });
});

describe("decideComplaintAction", () => {
  const base = { isSuperAdmin: false };
  it("caretaker walks received → acknowledged → investigating → resolved, forward only", () => {
    expect(decideComplaintAction({ ...base, orgRole: "CARETAKER", action: "acknowledge", currentStageIndex: 0 })).toMatchObject({ ok: true, toIndex: 1 });
    expect(decideComplaintAction({ ...base, orgRole: "CARETAKER", action: "resolve", currentStageIndex: 1 })).toMatchObject({ ok: true, toIndex: 4 });
    const back = decideComplaintAction({ ...base, orgRole: "CARETAKER", action: "acknowledge", currentStageIndex: 2 });
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.code).toBe("STAGE_ORDER");
  });

  it("close and reopen are manager-only", () => {
    const close = decideComplaintAction({ ...base, orgRole: "CARETAKER", action: "close", currentStageIndex: 4 });
    expect(close.ok).toBe(false);
    if (!close.ok) expect(close.status).toBe(403);
    expect(decideComplaintAction({ ...base, orgRole: "MANAGER", action: "close", currentStageIndex: 4 })).toMatchObject({ ok: true, toIndex: 5 });
    const reopenCare = decideComplaintAction({ ...base, orgRole: "CARETAKER", action: "reopen", currentStageIndex: 4, note: "not fixed" });
    expect(reopenCare.ok).toBe(false);
    expect(decideComplaintAction({ ...base, orgRole: "ADMIN", action: "reopen", currentStageIndex: 4, note: "not fixed" })).toMatchObject({ ok: true, toIndex: 2, reopen: true });
  });

  it("reopen needs a terminal stage and a note", () => {
    const early = decideComplaintAction({ ...base, orgRole: "MANAGER", action: "reopen", currentStageIndex: 2, note: "x" });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe("STAGE_ORDER");
    const noNote = decideComplaintAction({ ...base, orgRole: "MANAGER", action: "reopen", currentStageIndex: 5 });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.code).toBe("NOTE_REQUIRED");
  });

  it("super-admin bypasses the role tier", () => {
    expect(decideComplaintAction({ isSuperAdmin: true, orgRole: "CARETAKER", action: "close", currentStageIndex: 4 }).ok).toBe(true);
  });

  it("availableComplaintActions reflects the tier", () => {
    expect(availableComplaintActions("CARETAKER", 0)).toEqual(["acknowledge", "investigate", "await_tenant", "resolve"]);
    expect(availableComplaintActions("MANAGER", 4)).toEqual(["reopen", "close"]);
    expect(availableComplaintActions("CARETAKER", 4)).toEqual([]);
  });
});

describe("tenant directory projection", () => {
  it("exposes only id / name / phone / isActive / unit", () => {
    expect(Object.keys(TENANT_DIRECTORY_SELECT).sort()).toEqual([...TENANT_DIRECTORY_KEYS].sort());
    for (const k of ["monthlyRent", "depositAmount", "email", "nationalId", "taxIdNumber", "notes", "portalToken", "leaseEnd"]) {
      expect(k in TENANT_DIRECTORY_SELECT).toBe(false);
    }
    expect(Object.keys(TENANT_DIRECTORY_SELECT.unit.select).sort()).toEqual(["id", "propertyId", "unitNumber"]);
  });

  it("CARETAKER always gets the directory; others only on request", () => {
    expect(tenantReadIsDirectory("CARETAKER", false)).toBe(true);
    expect(tenantReadIsDirectory("MANAGER", false)).toBe(false);
    expect(tenantReadIsDirectory("MANAGER", true)).toBe(true);
  });
});

describe("validateCaseAttachments", () => {
  const img = (n = 1) => Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg`, size: 1024, type: "image/jpeg" }));
  it("accepts images and PDFs under the limits", () => {
    expect(validateCaseAttachments(img(3)).ok).toBe(true);
    expect(validateCaseAttachments([{ name: "q.pdf", size: 5 * 1024 * 1024, type: "application/pdf" }]).ok).toBe(true);
    expect(validateCaseAttachments([{ name: "IMG_1.HEIC", size: 10, type: "" }]).ok).toBe(true); // empty MIME → extension
  });
  it("rejects too many, too large, or the wrong type", () => {
    expect(validateCaseAttachments(img(CASE_ATTACHMENT_MAX_FILES + 1)).ok).toBe(false);
    expect(validateCaseAttachments([{ name: "big.jpg", size: 12 * 1024 * 1024, type: "image/jpeg" }]).ok).toBe(false);
    expect(validateCaseAttachments([{ name: "x.exe", size: 10, type: "application/octet-stream" }]).ok).toBe(false);
  });
});
