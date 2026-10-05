import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The subscription write-gate, enforced. Every POST / PATCH / PUT / DELETE
 * handler under src/app/api must go through a write helper (require*Write,
 * requirePermissionWrite, requireExpenseMutation, or an explicit
 * requireActiveSubscription) so a locked organisation — trial over, cancelled,
 * unpaid — can still read its data but not change it (HTTP 402).
 *
 * Whole areas that must keep working while locked are exempt by prefix; the
 * remaining handlers are listed one by one with the reason. A new mutating
 * route fails this test until it is gated or deliberately listed here.
 * (Property and unit edit / delete were ungated until 2026-10-01.)
 */
const EXEMPT_PREFIXES = [
  "auth/", "billing/", "webhooks/", "cron/", "portal/", "approvals/",
  "invitations/", "onboarding/", "demo/", "admin/", "organizations/", "v1/", "calendar/feed/",
];

const EXEMPT_HANDLERS = new Set([
  "POST calculator-report/route.ts", // public marketing calculator
  "POST contact/route.ts", // public contact form
  "POST sign/checkout/[token]/route.ts", // tenant signs a checkout by token link
  "POST vendor/[token]/route.ts", // vendor submits a quote by token link
  "POST report/route.ts", // renders the report PDF — a read in spirit
  "POST invoices/reconcile/route.ts", // preview only; /confirm writes and is gated
  "PATCH users/[id]/route.ts", // team management stays open so a locked org can fix seats
  "DELETE users/[id]/route.ts",
  // Gated inside authorizeBudget(id, { write: true }) — src/lib/service-charge-access.ts
  "PATCH service-charge/budgets/[id]/route.ts",
  "DELETE service-charge/budgets/[id]/route.ts",
  "POST service-charge/budgets/[id]/apply-charge/route.ts",
  "POST service-charge/budgets/[id]/balancing-invoices/route.ts",
  "POST service-charge/budgets/[id]/email/route.ts",
  "POST service-charge/budgets/[id]/publish/route.ts",
]);

const GATED = /Write\(|requirePermissionWrite|requireExpenseMutation|requireActiveSubscription|withActiveSubscription/;
const API = join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [p] : [];
  });
}

function ungatedHandlers(): string[] {
  const out: string[] = [];
  for (const file of routeFiles(API)) {
    const rel = relative(API, file).split("\\").join("/");
    if (EXEMPT_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const src = readFileSync(file, "utf8");
    const starts = Array.from(src.matchAll(/export async function (POST|PATCH|PUT|DELETE)\b/g));
    starts.forEach((m, k) => {
      const body = src.slice(m.index, k + 1 < starts.length ? starts[k + 1].index : src.length);
      const key = `${m[1]} ${rel}`;
      if (!GATED.test(body) && !EXEMPT_HANDLERS.has(key)) out.push(key);
    });
  }
  return out;
}

describe("subscription write-gate", () => {
  it("every mutating API handler is gated or deliberately exempt", () => {
    expect(ungatedHandlers()).toEqual([]);
  });
});
