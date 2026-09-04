import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The CARETAKER route allow-list, enforced. Only these route files may use a
 * helper that admits the on-site role (requireSession / requireSessionWrite /
 * requireOpsStaff / requireOpsStaffWrite / requireExpenseMutation). Every other
 * route stays on requireAuth / requireManager / requireAdmin, which are
 * allow-lists that exclude CARETAKER — so a route written by habit can never
 * open up to caretakers without a deliberate edit here.
 */
const CARETAKER_ROUTE_ALLOWLIST = new Set([
  // Expenses (own-row rules in src/lib/expense-access.ts)
  "src/app/api/expenses/route.ts",
  "src/app/api/expenses/[id]/route.ts",
  "src/app/api/expenses/[id]/documents/route.ts",
  "src/app/api/expenses/[id]/documents/[docId]/route.ts",
  "src/app/api/tax-configs/route.ts",
  // Maintenance (no delete, no schedule writes)
  "src/app/api/maintenance/route.ts",
  "src/app/api/maintenance/[id]/route.ts",
  "src/app/api/maintenance/[id]/vendor-link/route.ts",
  "src/app/api/maintenance/schedules/route.ts",
  "src/app/api/maintenance/sla/route.ts",
  // Vendors (trimmed read, full create, no edit/delete)
  "src/app/api/vendors/route.ts",
  "src/app/api/vendors/[id]/route.ts",
  // Property list (CARETAKER projection)
  "src/app/api/properties/route.ts",
  // Tenants directory projection (id / name / phone / unit only for CARETAKER)
  "src/app/api/tenants/route.ts",
  // Tenant complaints (STAFF_CONDUCT hidden from CARETAKER — src/lib/complaint-rules.ts)
  "src/app/api/complaints/route.ts",
  "src/app/api/complaints/[id]/route.ts",
  "src/app/api/complaints/[id]/events/route.ts",
  // Global search — per-group scoping in src/lib/search-visibility.ts
  "src/app/api/search/route.ts",
  // Identity-scoped plumbing every signed-in user needs
  "src/app/api/notification-preferences/route.ts",
  "src/app/api/invitations/my/route.ts",
  "src/app/api/invitations/[token]/accept/route.ts",
  "src/app/api/onboarding/create-org/route.ts",
  "src/app/api/stripe/status/route.ts",
]);

const CARETAKER_HELPERS = /\b(requireSession|requireSessionWrite|requireOpsStaff|requireOpsStaffWrite|requireExpenseMutation)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

describe("CARETAKER route allow-list", () => {
  const root = join(__dirname, "..", "..", "..");
  const routes = walk(join(root, "src", "app", "api"));

  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("only allow-listed routes use a caretaker-admitting helper", () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const rel = relative(root, file).replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      if (CARETAKER_HELPERS.test(src) && !CARETAKER_ROUTE_ALLOWLIST.has(rel)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("every allow-listed route still exists", () => {
    const existing = new Set(routes.map((f) => relative(root, f).replace(/\\/g, "/")));
    for (const rel of Array.from(CARETAKER_ROUTE_ALLOWLIST)) expect(existing.has(rel), rel).toBe(true);
  });
});
