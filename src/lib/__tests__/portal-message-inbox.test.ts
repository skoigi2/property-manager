import { describe, it, expect } from "vitest";
import { unansweredSince, daysWaiting, tenantMessageSeverity, tenantMessageHref } from "../portal-message-inbox";

const at = (s: string) => new Date(`2026-10-${s}:00Z`);

describe("unansweredSince", () => {
  it("a new thread waits from the tenant's first message", () => {
    expect(unansweredSince([{ sender: "TENANT", createdAt: at("01T09:00") }])).toEqual(at("01T09:00"));
  });

  it("a tenant follow-up doesn't reset the clock", () => {
    expect(
      unansweredSince([
        { sender: "TENANT", createdAt: at("01T09:00") },
        { sender: "TENANT", createdAt: at("02T15:00") },
      ]),
    ).toEqual(at("01T09:00"));
  });

  it("a manager reply answers it; the tenant writing again starts a new wait", () => {
    const thread = [
      { sender: "TENANT", createdAt: at("01T09:00") },
      { sender: "MANAGER", createdAt: at("01T12:00") },
    ];
    expect(unansweredSince(thread)).toBeNull();
    expect(unansweredSince([...thread, { sender: "TENANT", createdAt: at("03T08:00") }])).toEqual(at("03T08:00"));
  });

  it("order of the input doesn't matter", () => {
    expect(
      unansweredSince([
        { sender: "TENANT", createdAt: at("03T08:00") },
        { sender: "MANAGER", createdAt: at("01T12:00") },
        { sender: "TENANT", createdAt: at("01T09:00") },
      ]),
    ).toEqual(at("03T08:00"));
  });

  it("no messages → nothing waiting", () => {
    expect(unansweredSince([])).toBeNull();
  });
});

describe("severity", () => {
  const since = at("01T09:00");
  it("warning at first, urgent after two days without a reply", () => {
    expect(daysWaiting(since, at("01T18:00"))).toBe(0);
    expect(tenantMessageSeverity(since, at("02T10:00"))).toBe("WARNING");
    expect(tenantMessageSeverity(since, at("03T09:00"))).toBe("URGENT");
  });
});

describe("tenantMessageHref", () => {
  it("opens the conversation on the tenant's Portal Msgs tab", () => {
    expect(tenantMessageHref("t1", "th1")).toBe("/tenants/t1?tab=messages&thread=th1");
  });
});
