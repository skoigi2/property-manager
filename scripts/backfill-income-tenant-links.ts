/**
 * Backfill IncomeEntry.tenantId links — DRY-RUN BY DEFAULT.
 *
 *   npm run statements:backfill-links            → dry run (no writes)
 *   npm run statements:backfill-links -- --apply → actually link
 *
 * Phase 0 proved the original invoiceId-linking plan a no-op: every unlinked
 * entry has tenantId = null, so it can never appear on any tenant statement.
 * This script attributes those payments to tenants instead. For each
 * IncomeEntry with tenantId = null and a unitId, it finds the tenancy that
 * occupied that unit on the entry date:
 *
 *   - same unit
 *   - leaseStart <= entry date <= occupancy end, where occupancy end is
 *     vacatedDate, else (for inactive tenants) leaseEnd, else open-ended for
 *     active tenants. Inactive tenants with neither vacatedDate nor leaseEnd
 *     are indeterminate and never matched.
 *
 * Links ONLY where exactly one tenancy matches — units with turnover
 * ambiguity are skipped and listed for manual review. A payment attributed
 * to the WRONG tenant is worse than one attributed to none.
 *
 * Guardrails:
 *   - Sets IncomeEntry.tenantId and NOTHING else. Never touches invoiceId or
 *     Invoice.status (the status path fires the invoice.paid webhook, clears
 *     hints, and can auto-advance a linked CaseThread).
 *   - AIRBNB-typed and DEPOSIT-typed entries are skipped entirely. AIRBNB is
 *     not a tenancy payment; deposit attribution has its own manual UI flow
 *     on the tenant Deposit tab.
 *   - Idempotent: the update predicate re-checks tenantId IS NULL.
 *   - Chunked updates, never one query per row.
 *   - Report written to scripts/backfill-output-<timestamp>.md.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const CHUNK_SIZE = 50;

// Only types that represent a tenancy payment are attributable.
const LINKABLE_TYPES = ["LONGTERM_RENT", "SERVICE_CHARGE", "UTILITY_RECOVERY", "OTHER"] as const;

const num = (d: unknown): number => (d == null ? 0 : Number(d));
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

type TenancyRow = {
  id: string;
  name: string;
  unitId: string;
  leaseStart: Date;
  leaseEnd: Date | null;
  vacatedDate: Date | null;
  isActive: boolean;
};

/** Occupancy end for matching; null = open-ended, undefined = indeterminate. */
function occupancyEnd(t: TenancyRow): Date | null | undefined {
  if (t.vacatedDate) return t.vacatedDate;
  if (t.isActive) return null; // still in occupancy
  return t.leaseEnd ?? undefined; // vacated at an unknown date — never match
}

function occupies(t: TenancyRow, date: Date): boolean {
  if (date < t.leaseStart) return false;
  const end = occupancyEnd(t);
  if (end === undefined) return false;
  if (end === null) return true;
  return date <= end;
}

async function main() {
  console.log(APPLY ? "⚠ APPLY mode — links will be written." : "Dry run — no writes. Pass --apply to link.");

  const [entries, tenants] = await Promise.all([
    prisma.incomeEntry.findMany({
      where: { tenantId: null, type: { in: [...LINKABLE_TYPES] } },
      select: {
        id: true,
        date: true,
        type: true,
        grossAmount: true,
        unitId: true,
        unit: { select: { unitNumber: true, property: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        unitId: true,
        leaseStart: true,
        leaseEnd: true,
        vacatedDate: true,
        isActive: true,
      },
    }),
  ]);

  console.log(`Unattributed linkable entries: ${entries.length} · Tenancies loaded: ${tenants.length}`);

  const tenantsByUnit = new Map<string, TenancyRow[]>();
  for (const t of tenants) {
    const list = tenantsByUnit.get(t.unitId) ?? [];
    list.push(t);
    tenantsByUnit.set(t.unitId, list);
  }

  type Link = { entry: (typeof entries)[number]; tenant: TenancyRow };
  type Skip = { entry: (typeof entries)[number]; reason: string; candidates: string[] };
  const links: Link[] = [];
  const skips: Skip[] = [];

  for (const entry of entries) {
    const matches = (tenantsByUnit.get(entry.unitId) ?? []).filter((t) => occupies(t, entry.date));
    if (matches.length === 1) {
      links.push({ entry, tenant: matches[0] });
    } else {
      skips.push({
        entry,
        reason:
          matches.length === 0
            ? "no tenancy occupied the unit on this date"
            : `ambiguous — ${matches.length} overlapping tenancies (unit turnover)`,
        candidates: matches.map((m) => m.name),
      });
    }
  }

  let applied = 0;
  if (APPLY && links.length > 0) {
    for (let i = 0; i < links.length; i += CHUNK_SIZE) {
      const chunk = links.slice(i, i + CHUNK_SIZE);
      const results = await prisma.$transaction(
        chunk.map((l) =>
          prisma.incomeEntry.updateMany({
            where: { id: l.entry.id, tenantId: null },
            data: { tenantId: l.tenant.id },
          })
        )
      );
      applied += results.reduce((s, r) => s + r.count, 0);
      console.log(`  linked ${Math.min(i + CHUNK_SIZE, links.length)}/${links.length}…`);
    }
  }

  const now = new Date();
  const lines: string[] = [
    `# backfill-income-tenant-links report — ${now.toISOString()}`,
    ``,
    `Mode: **${APPLY ? "APPLY" : "DRY RUN"}**`,
    ``,
    `- Unattributed linkable entries examined: **${entries.length}**`,
    `- Unambiguous attributions ${APPLY ? "written" : "that would be written"}: **${links.length}**${APPLY ? ` (rows updated: ${applied})` : ""}`,
    `- Skipped for manual review: **${skips.length}**`,
    ``,
  ];

  if (links.length > 0) {
    lines.push(`## Attributions ${APPLY ? "written" : "proposed"}`);
    lines.push(``);
    lines.push(`| Property | Unit | Entry date | Type | Amount | → Tenant | Tenancy |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const l of links) {
      const end = l.tenant.vacatedDate ?? l.tenant.leaseEnd;
      lines.push(
        `| ${l.entry.unit.property.name} | ${l.entry.unit.unitNumber} | ${fmtDate(l.entry.date)} | ${l.entry.type} | ${num(l.entry.grossAmount).toFixed(2)} | ${l.tenant.name} | ${fmtDate(l.tenant.leaseStart)} → ${end ? fmtDate(end) : "present"} |`
      );
    }
    lines.push(``);
  }

  if (skips.length > 0) {
    lines.push(`## Skipped — manual review`);
    lines.push(``);
    lines.push(`| Property | Unit | Entry date | Type | Amount | Reason | Candidate tenants |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const s of skips) {
      lines.push(
        `| ${s.entry.unit.property.name} | ${s.entry.unit.unitNumber} | ${fmtDate(s.entry.date)} | ${s.entry.type} | ${num(s.entry.grossAmount).toFixed(2)} | ${s.reason} | ${s.candidates.join(", ") || "—"} |`
      );
    }
    lines.push(``);
  }

  const ts = now.toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "scripts", `backfill-output-${ts}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(
    `\n${APPLY ? "✅ Applied" : "Would apply"} ${links.length} attribution(s); ${skips.length} skipped for manual review.`
  );
  console.log(`📝 Report: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
