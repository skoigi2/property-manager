import { describe, it, expect } from "vitest";
import { invitationProblem } from "../invitation-accept";

const NOW = new Date("2026-08-28T12:00:00Z");
const FUTURE = new Date("2026-08-30T12:00:00Z");
const PAST = new Date("2026-08-26T12:00:00Z");

describe("invitationProblem", () => {
  it("returns null for a live invitation", () => {
    expect(invitationProblem({ acceptedAt: null, expiresAt: FUTURE }, NOW)).toBeNull();
  });

  it("returns 'accepted' once acceptedAt is set", () => {
    expect(invitationProblem({ acceptedAt: PAST, expiresAt: FUTURE }, NOW)).toBe("accepted");
  });

  it("returns 'expired' when expiresAt is in the past", () => {
    expect(invitationProblem({ acceptedAt: null, expiresAt: PAST }, NOW)).toBe("expired");
  });

  it("prefers 'accepted' over 'expired' for an accepted-then-expired invite", () => {
    expect(invitationProblem({ acceptedAt: PAST, expiresAt: PAST }, NOW)).toBe("accepted");
  });

  it("treats an invitation expiring exactly now as still live (strict <)", () => {
    expect(invitationProblem({ acceptedAt: null, expiresAt: NOW }, NOW)).toBeNull();
  });

  it("defaults `now` to the current time", () => {
    expect(invitationProblem({ acceptedAt: null, expiresAt: new Date(Date.now() + 60_000) })).toBeNull();
    expect(invitationProblem({ acceptedAt: null, expiresAt: new Date(Date.now() - 60_000) })).toBe("expired");
  });
});
