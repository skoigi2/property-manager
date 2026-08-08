/**
 * Backfill IncomeEntry.invoiceId links — DRY-RUN BY DEFAULT.
 *
 *   npm run statements:backfill-links            → dry run (no writes)
 *   npm run statements:backfill-links -- --apply → actually link
 *
 * For each IncomeEntry with invoiceId = null, finds candidate invoices where:
 *   - same tenantId
 *   - invoice status not DRAFT / CANCELLED
 *   - the entry date falls inside the invoice's billing period
 *     (periodYear/periodMonth), OR within ±7 days of dueDate
 *   - grossAmount matches totalAmount to the cent
 *   - the invoice has no already-linked IncomeEntry (never double-allocate)
 *
 * Links ONLY where exactly one candidate exists. Zero or multiple candidates
 * → skipped and listed in the report for manual review. If the same invoice
 * is the unique candidate for more than one entry, none of them are linked.
 *
 * Guardrails:
 *   - Sets IncomeEntry.invoiceId and NOTHING else. Never flips Invoice.status
 *     (that path fires the invoice.paid webhook, clears hints, and can
 *     auto-advance a linked CaseThread — a backfill must not trigger it).
 *   - Idempotent: the update predicate re-checks invoiceId IS NULL.
 *   - Chunked transactions, never one query per row.
 *   - Report written to scripts/backfill-output-<timestamp>.md.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const DUE_DATE_TOLERANCE_DAYS = 7;
const CHUNK_SIZE = 50;

// Only these types can plausibly settle a rent invoice. DEPOSIT is excluded
// by design (not rent income); owner-fee types never carry a tenantId.
const LINKABLE_TYPES = ["LONGTERM_RENT", "SERVICE_CHARGE", "UTILITY_RECOVERY", "OTHER"] as const;

const num = (d: unknown): number => (d == null ? 0 : Number(d));
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

function inBillingPeriod(entryDate: Date, periodYear: number, periodMonth: number): boolean {
  return entryDate.getUTCFullYear() === periodYear && entryDate.getUTCMonth() + 1 === periodMonth;
}

function nearDueDate(entryDate: Date, dueDate: Date): boolean {
  const diffDays = Math.abs(entryDate.getTime() - dueDate.getTime()) / 86_400_000;
  return diffDays <= DUE_DATE_TOLERANCE_DAYS;
}

async function main() {
  console.log(APPLY ? "⚠ APPLY mode — links will be written." : "Dry run — no writes. Pass --apply to link.");

  const [entries, invoices] = await Promise.all([
    prisma.incomeEntry.findMany({
      where: {
        invoiceId: null,
        tenantId: { not: null },
        type: { in: [...LINKABLE_TYPES] },
      },
      select: {
        id: true,
        date: true,
        type: true,
        grossAmount: true,
        tenantId: true,
        unit: { select: { property: { select: { name: true } } } },
        tenant: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.invoice.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: {
        id: true,
        invoiceNumber: true,
        tenantId: true,
        periodYear: true,
        periodMonth: true,
        totalAmount: true,
        dueDate: true,
        status: true,
        _count: { select: { incomeEntries: true } },
      },
    }),
  ]);

  console.log(`Unlinked linkable entries: ${entries.length} · Candidate invoices loaded: ${invoices.length}`);

  const invoicesByTenant = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    if (inv._count.incomeEntries > 0) continue; // never double-allocate
    const list = invoicesByTenant.get(inv.tenantId) ?? [];
    list.push(inv);
    invoicesByTenant.set(inv.tenantId, list);
  }

  type Link = { entry: (typeof entries)[number]; invoice: (typeof invoices)[number] };
  type Skip = { entry: (typeof entries)[number]; reason: string; candidates: string[] };
  const links: Link[] = [];
  const skips: Skip[] = [];

  for (const entry of entries) {
    const candidates = (invoicesByTenant.get(entry.tenantId!) ?? []).filter(
      (inv) =>
        sameAmount(num(entry.grossAmount), num(inv.totalAmount)) &&
        (inBillingPeriod(entry.date, inv.periodYear, inv.periodMonth) || nearDueDate(entry.date, inv.dueDate))
    );
    if (candidates.length === 1) {
      links.push({ entry, invoice: candidates[0] });
    } else {
      skips.push({
        entry,
        reason: candidates.length === 0 ? "no matching invoice" : `ambiguous (${candidates.length} candidates)`,
        candidates: candidates.map((c) => c.invoiceNumber),
      });
    }
  }

  // If one invoice is the unique candidate for several entries, link none of
  // them — a human must decide which payment settles it.
  const claimCount = new Map<string, number>();
  for (const l of links) claimCount.set(l.invoice.id, (claimCount.get(l.invoice.id) ?? 0) + 1);
  const contested = links.filter((l) => claimCount.get(l.invoice.id)! > 1);
  const clean = links.filter((l) => claimCount.get(l.invoice.id)! === 1);
  for (const l of contested) {
    skips.push({
      entry: l.entry,
      reason: `invoice ${l.invoice.invoiceNumber} claimed by multiple entries`,
      candidates: [l.invoice.invoiceNumber],
    });
  }

  // Apply in chunks — updateMany with an invoiceId IS NULL guard keeps this
  // idempotent even if a concurrent process linked the row meanwhile.
  let applied = 0;
  if (APPLY && clean.length > 0) {
    for (let i = 0; i < clean.length; i += CHUNK_SIZE) {
      const chunk = clean.slice(i, i + CHUNK_SIZE);
      const results = await prisma.$transaction(
        chunk.map((l) =>
          prisma.incomeEntry.updateMany({
            where: { id: l.entry.id, invoiceId: null },
            data: { invoiceId: l.invoice.id },
          })
        )
      );
      applied += results.reduce((s, r) => s + r.count, 0);
      console.log(`  linked ${Math.min(i + CHUNK_SIZE, clean.length)}/${clean.length}…`);
    }
  }

  // ---------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------
  const now = new Date();
  const lines: string[] = [
    `# backfill-income-invoice-links report — ${now.toISOString()}`,
    ``,
    `Mode: **${APPLY ? "APPLY" : "DRY RUN"}**`,
    ``,
    `- Unlinked linkable entries examined: **${entries.length}**`,
    `- Unambiguous links ${APPLY ? "written" : "that would be written"}: **${clean.length}**${APPLY ? ` (rows updated: ${applied})` : ""}`,
    `- Skipped for manual review: **${skips.length}**`,
    ``,
  ];

  if (clean.length > 0) {
    lines.push(`## Links ${APPLY ? "written" : "proposed"}`);
    lines.push(``);
    lines.push(`| Property | Tenant | Entry date | Amount | → Invoice | Period | Invoice status |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const l of clean) {
      lines.push(
        `| ${l.entry.unit.property.name} | ${l.entry.tenant?.name ?? "—"} | ${fmtDate(l.entry.date)} | ${num(l.entry.grossAmount).toFixed(2)} | ${l.invoice.invoiceNumber} | ${l.invoice.periodYear}-${String(l.invoice.periodMonth).padStart(2, "0")} | ${l.invoice.status} |`
      );
    }
    lines.push(``);
  }

  if (skips.length > 0) {
    lines.push(`## Skipped — manual review`);
    lines.push(``);
    lines.push(`| Property | Tenant | Entry date | Type | Amount | Reason | Candidates |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const s of skips) {
      lines.push(
        `| ${s.entry.unit.property.name} | ${s.entry.tenant?.name ?? "—"} | ${fmtDate(s.entry.date)} | ${s.entry.type} | ${num(s.entry.grossAmount).toFixed(2)} | ${s.reason} | ${s.candidates.join(", ") || "—"} |`
      );
    }
    lines.push(``);
  }

  const ts = now.toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "scripts", `backfill-output-${ts}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(
    `\n${APPLY ? "✅ Applied" : "Would apply"} ${clean.length} link(s); ${skips.length} skipped for manual review.`
  );
  console.log(`📝 Report: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
