/**
 * One-shot codemod: apply the subscription write-gate to mutating API handlers.
 *
 * For every src/app/api route file (minus exclusions), rewrites
 * requireAuth()/requireManager()/requireAdmin() calls that appear inside
 * POST/PATCH/PUT/DELETE handlers to their *Write() variants, and fixes the
 * import from "@/lib/auth-utils". Files already referencing
 * requireActiveSubscription are skipped (they gate deliberately).
 *
 * Usage: node scripts/codemod-write-gate.js [--dry]
 */
const fs = require("fs");
const path = require("path");

const API_ROOT = path.join(__dirname, "..", "src", "app", "api");
const DRY = process.argv.includes("--dry");

// Route prefixes (relative to src/app/api) that must keep working when an org
// is locked: auth flows, payment recovery, public token endpoints, platform
// admin, org-lifecycle, and inbound webhooks/cron.
const EXCLUDE = [
  "auth",
  "webhooks",
  "cron",
  "portal",
  "approvals",
  "billing",
  "stripe",
  "contact",
  "invitations",
  "onboarding",
  "demo",
  "admin",
  "organizations",
  // POST /api/report renders a PDF — a read in spirit; locked orgs keep report access.
  "report",
];

const MUTATING = ["POST", "PATCH", "PUT", "DELETE"];
const HELPERS = ["requireAuth", "requireManager", "requireAdmin"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const changed = [];
const skippedCovered = [];

for (const file of walk(API_ROOT)) {
  const rel = path.relative(API_ROOT, file).replace(/\\/g, "/");
  if (EXCLUDE.some((p) => rel === p || rel.startsWith(p + "/"))) continue;

  let src = fs.readFileSync(file, "utf8");
  if (src.includes("requireActiveSubscription")) {
    skippedCovered.push(rel);
    continue;
  }

  // Split the file at exported handler boundaries so replacements only apply
  // inside mutating handlers.
  const marker = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
  const indices = [];
  let m;
  while ((m = marker.exec(src)) !== null) indices.push({ idx: m.index, method: m[1] });
  if (indices.length === 0) continue;

  let out = src.slice(0, indices[0].idx);
  let fileChanged = false;
  const usedWriteHelpers = new Set();

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].idx;
    const end = i + 1 < indices.length ? indices[i + 1].idx : src.length;
    let segment = src.slice(start, end);
    if (MUTATING.includes(indices[i].method)) {
      for (const helper of HELPERS) {
        const re = new RegExp(`\\b${helper}\\(\\)`, "g");
        if (re.test(segment)) {
          segment = segment.replace(re, `${helper}Write()`);
          usedWriteHelpers.add(`${helper}Write`);
          fileChanged = true;
        }
      }
    }
    out += segment;
  }

  if (!fileChanged) continue;

  // Extend the auth-utils import with the Write variants now referenced.
  const importRe = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/auth-utils["']/;
  const im = out.match(importRe);
  if (!im) {
    console.warn(`!! ${rel}: uses helpers but no auth-utils import found — skipped`);
    continue;
  }
  const names = im[1].split(",").map((s) => s.trim()).filter(Boolean);
  for (const w of usedWriteHelpers) if (!names.includes(w)) names.push(w);
  out = out.replace(importRe, `import { ${names.join(", ")} } from "@/lib/auth-utils"`);

  changed.push(rel);
  if (!DRY) fs.writeFileSync(file, out, "utf8");
}

console.log(`${DRY ? "[dry-run] would change" : "changed"} ${changed.length} files:`);
for (const f of changed) console.log("  " + f);
console.log(`\nskipped (already gate explicitly): ${skippedCovered.length}`);
