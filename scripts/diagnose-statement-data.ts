/**
 * Tenant-statement data diagnostic — STRICTLY READ-ONLY.
 *
 * Measures the data-quality gaps a Tenant Statement of Account would surface,
 * per property, before the feature is built. Safe to run against production.
 *
 * Checks:
 *   1. IncomeEntry rows with invoiceId = null (payments against no charge)
 *   2. Invoice count vs IncomeEntry count — the "does this property even use
 *      the invoice workflow?" classifier
 *   3. PAID invoices with no linked IncomeEntry (reverse orphans)
 *   4. Tenants whose leaseStart post-dates their earliest invoice/income row
 *      (leaseStart is non-nullable in the schema, so null is impossible)
 *   5. Tenant-months with payments but zero invoices issued
 *   6. PENDING_VERIFICATION invoices, bucketed by proof age
 *   7. Tenants whose income entries span more than one currency
 *
 * Output: markdown report at scripts/statement-diagnostic-<timestamp>.md
 * plus a summary table on stdout. No writes, no mutations.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const num = (d: unknown): number => (d == null ? 0 : Number(d));
const fmtDate = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : "—";
const fmtMoney = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Income types that belong on a rent statement ledger (DEPOSIT is excluded by
// design; owner-fee types never carry a tenantId).
const STATEMENT_TYPES = ["LONGTERM_RENT", "SERVICE_CHARGE", "UTILITY_RECOVERY", "OTHER"] as const;

async function main() {
  const [properties, incomeEntries, invoices, tenants] = await Promise.all([
    prisma.property.findMany({ select: { id: true, name: true, currency: true } }),
    prisma.incomeEntry.findMany({
      select: {
        id: true,
        date: true,
        type: true,
        grossAmount: true,
        tenantId: true,
        invoiceId: true,
        unit: { select: { propertyId: true, property: { select: { currency: true } } } },
      },
    }),
    prisma.invoice.findMany({
      select: {
        id: true,
        invoiceNumber: true,
        tenantId: true,
        periodYear: true,
        periodMonth: true,
        totalAmount: true,
        status: true,
        dueDate: true,
        proofSubmittedAt: true,
        updatedAt: true,
        createdAt: true,
        _count: { select: { incomeEntries: true } },
        tenant: { select: { unit: { select: { propertyId: true } } } },
      },
    }),
    prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        leaseStart: true,
        isActive: true,
        unit: { select: { propertyId: true, property: { select: { currency: true } } } },
      },
    }),
  ]);

  const propById = new Map(properties.map((p) => [p.id, p]));
  const propName = (id: string | null | undefined) =>
    (id && propById.get(id)?.name) || "(unknown property)";
  const propCurrency = (id: string | null | undefined) =>
    (id && propById.get(id)?.currency) || "?";

  const now = new Date();
  const lines: string[] = [
    `# Tenant-statement data diagnostic — ${now.toISOString()}`,
    ``,
    `Read-only. Properties: ${properties.length} · IncomeEntry rows: ${incomeEntries.length} · Invoice rows: ${invoices.length} · Tenants: ${tenants.length}`,
    ``,
  ];

  // ---------------------------------------------------------------
  // 1. Unlinked income entries (invoiceId = null)
  // ---------------------------------------------------------------
  type UnlinkedAgg = { count: number; total: number; oldest: Date | null; tenantLinked: number; rentType: number };
  const unlinkedByProp = new Map<string, UnlinkedAgg>();
  for (const e of incomeEntries) {
    if (e.invoiceId !== null) continue;
    if (e.type === "DEPOSIT") continue; // deposits never link to rent invoices by design
    const pid = e.unit.propertyId;
    const agg = unlinkedByProp.get(pid) ?? { count: 0, total: 0, oldest: null, tenantLinked: 0, rentType: 0 };
    agg.count++;
    agg.total += num(e.grossAmount);
    if (!agg.oldest || e.date < agg.oldest) agg.oldest = e.date;
    if (e.tenantId) agg.tenantLinked++;
    if (e.type === "LONGTERM_RENT") agg.rentType++;
    unlinkedByProp.set(pid, agg);
  }

  lines.push(`## 1. IncomeEntry rows with no invoice link (DEPOSIT excluded)`);
  lines.push(``);
  lines.push(`| Property | Unlinked | Total value | Oldest | With tenantId | LONGTERM_RENT |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const p of properties) {
    const a = unlinkedByProp.get(p.id);
    lines.push(
      `| ${p.name} | ${a?.count ?? 0} | ${fmtMoney(a?.total ?? 0, p.currency)} | ${fmtDate(a?.oldest)} | ${a?.tenantLinked ?? 0} | ${a?.rentType ?? 0} |`
    );
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // 2. Invoice count vs IncomeEntry count (the classifier)
  // ---------------------------------------------------------------
  const incomeCountByProp = new Map<string, number>();
  for (const e of incomeEntries) {
    if (e.type === "DEPOSIT") continue;
    incomeCountByProp.set(e.unit.propertyId, (incomeCountByProp.get(e.unit.propertyId) ?? 0) + 1);
  }
  const invoiceCountByProp = new Map<string, number>();
  for (const inv of invoices) {
    const pid = inv.tenant.unit.propertyId;
    invoiceCountByProp.set(pid, (invoiceCountByProp.get(pid) ?? 0) + 1);
  }

  lines.push(`## 2. Invoice workflow usage per property (the classifier)`);
  lines.push(``);
  lines.push(`| Property | Invoices | Income entries (non-deposit) | Ratio | Classification |`);
  lines.push(`|---|---|---|---|---|`);
  const classification = new Map<string, string>();
  for (const p of properties) {
    const inv = invoiceCountByProp.get(p.id) ?? 0;
    const inc = incomeCountByProp.get(p.id) ?? 0;
    const ratio = inc === 0 ? (inv === 0 ? "—" : "∞") : (inv / inc).toFixed(2);
    let cls: string;
    if (inv === 0 && inc === 0) cls = "no activity";
    else if (inv === 0) cls = "never used invoices";
    else if (inc > 0 && inv / inc < 0.25) cls = "barely uses invoices";
    else cls = "invoice workflow in use";
    classification.set(p.id, cls);
    lines.push(`| ${p.name} | ${inv} | ${inc} | ${ratio} | ${cls} |`);
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // 3. PAID invoices with no linked IncomeEntry
  // ---------------------------------------------------------------
  const reverseOrphans = invoices.filter((i) => i.status === "PAID" && i._count.incomeEntries === 0);
  const reverseByProp = new Map<string, { count: number; total: number }>();
  for (const inv of reverseOrphans) {
    const pid = inv.tenant.unit.propertyId;
    const agg = reverseByProp.get(pid) ?? { count: 0, total: 0 };
    agg.count++;
    agg.total += num(inv.totalAmount);
    reverseByProp.set(pid, agg);
  }

  lines.push(`## 3. PAID invoices with no linked IncomeEntry (reverse orphans)`);
  lines.push(``);
  if (reverseOrphans.length === 0) {
    lines.push(`None found. ✅`);
  } else {
    lines.push(`| Property | Count | Total value |`);
    lines.push(`|---|---|---|`);
    reverseByProp.forEach((agg, pid) => {
      lines.push(`| ${propName(pid)} | ${agg.count} | ${fmtMoney(agg.total, propCurrency(pid))} |`);
    });
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // 4. leaseStart later than earliest invoice/income activity
  // ---------------------------------------------------------------
  const earliestActivity = new Map<string, Date>(); // tenantId → earliest date
  for (const e of incomeEntries) {
    if (!e.tenantId) continue;
    const cur = earliestActivity.get(e.tenantId);
    if (!cur || e.date < cur) earliestActivity.set(e.tenantId, e.date);
  }
  for (const inv of invoices) {
    // billing-period start is the invoice's earliest meaningful date
    const periodStart = new Date(Date.UTC(inv.periodYear, inv.periodMonth - 1, 1));
    const cur = earliestActivity.get(inv.tenantId);
    if (!cur || periodStart < cur) earliestActivity.set(inv.tenantId, periodStart);
  }
  const leaseStartAnomalies = tenants
    .map((t) => ({ t, earliest: earliestActivity.get(t.id) }))
    .filter((x): x is { t: (typeof tenants)[number]; earliest: Date } => !!x.earliest && x.earliest < x.t.leaseStart);

  lines.push(`## 4. Tenants with activity predating leaseStart`);
  lines.push(``);
  lines.push(`(leaseStart is a non-nullable column, so "null leaseStart" cannot occur.)`);
  lines.push(``);
  if (leaseStartAnomalies.length === 0) {
    lines.push(`None found. ✅`);
  } else {
    lines.push(`| Property | Tenant | leaseStart | Earliest invoice/income | Gap (days) |`);
    lines.push(`|---|---|---|---|---|`);
    for (const { t, earliest } of leaseStartAnomalies) {
      const gapDays = Math.round((t.leaseStart.getTime() - earliest.getTime()) / 86_400_000);
      lines.push(
        `| ${propName(t.unit.propertyId)} | ${t.name}${t.isActive ? "" : " (vacated)"} | ${fmtDate(t.leaseStart)} | ${fmtDate(earliest)} | ${gapDays} |`
      );
    }
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // 5. Tenant-months with payments but zero invoices issued
  // ---------------------------------------------------------------
  const invoicedMonths = new Set<string>(); // `${tenantId}:${yyyy}-${mm}`
  for (const inv of invoices) {
    if (inv.status === "DRAFT" || inv.status === "CANCELLED") continue;
    invoicedMonths.add(`${inv.tenantId}:${inv.periodYear}-${String(inv.periodMonth).padStart(2, "0")}`);
  }
  const uninvoicedByProp = new Map<string, Set<string>>(); // propertyId → tenant-month keys
  for (const e of incomeEntries) {
    if (!e.tenantId || !(STATEMENT_TYPES as readonly string[]).includes(e.type)) continue;
    const key = `${e.tenantId}:${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (invoicedMonths.has(key)) continue;
    const pid = e.unit.propertyId;
    if (!uninvoicedByProp.has(pid)) uninvoicedByProp.set(pid, new Set());
    uninvoicedByProp.get(pid)!.add(key);
  }

  lines.push(`## 5. Tenant-months with payments but no invoice issued`);
  lines.push(``);
  lines.push(`Distinguishes "payment exists but was never linked" (fixable) from "this month was never invoiced at all" (workflow not used).`);
  lines.push(``);
  lines.push(`| Property | Uninvoiced tenant-months | Classification (from §2) |`);
  lines.push(`|---|---|---|`);
  for (const p of properties) {
    lines.push(`| ${p.name} | ${uninvoicedByProp.get(p.id)?.size ?? 0} | ${classification.get(p.id)} |`);
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // 6. PENDING_VERIFICATION backlog by age
  // ---------------------------------------------------------------
  const pending = invoices.filter((i) => i.status === "PENDING_VERIFICATION");
  lines.push(`## 6. PENDING_VERIFICATION invoices by age`);
  lines.push(``);
  if (pending.length === 0) {
    lines.push(`None found. ✅`);
  } else {
    const buckets = { "≤7 days": 0, "8–30 days": 0, ">30 days": 0 };
    lines.push(`| Property | Invoice | Amount | Proof submitted | Age (days) |`);
    lines.push(`|---|---|---|---|---|`);
    for (const inv of pending) {
      const anchor = inv.proofSubmittedAt ?? inv.updatedAt;
      const ageDays = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);
      if (ageDays <= 7) buckets["≤7 days"]++;
      else if (ageDays <= 30) buckets["8–30 days"]++;
      else buckets[">30 days"]++;
      const pid = inv.tenant.unit.propertyId;
      lines.push(
        `| ${propName(pid)} | ${inv.invoiceNumber} | ${fmtMoney(num(inv.totalAmount), propCurrency(pid))} | ${fmtDate(anchor)} | ${ageDays} |`
      );
    }
    lines.push(``);
    lines.push(`Buckets: ≤7 days: ${buckets["≤7 days"]} · 8–30 days: ${buckets["8–30 days"]} · >30 days: ${buckets[">30 days"]}`);
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // 7. Tenants whose entries span more than one currency
  // ---------------------------------------------------------------
  const currenciesByTenant = new Map<string, Set<string>>();
  for (const e of incomeEntries) {
    if (!e.tenantId) continue;
    if (!currenciesByTenant.has(e.tenantId)) currenciesByTenant.set(e.tenantId, new Set());
    currenciesByTenant.get(e.tenantId)!.add(e.unit.property.currency);
  }
  const multiCurrency = tenants.filter((t) => {
    const set = currenciesByTenant.get(t.id);
    if (!set) return false;
    const all = new Set(set);
    all.add(t.unit.property.currency); // entries may point at old units in another property
    return all.size > 1;
  });

  lines.push(`## 7. Tenants spanning more than one currency`);
  lines.push(``);
  if (multiCurrency.length === 0) {
    lines.push(`None found. ✅`);
  } else {
    lines.push(`| Property | Tenant | Currencies seen |`);
    lines.push(`|---|---|---|`);
    for (const t of multiCurrency) {
      const all = new Set(currenciesByTenant.get(t.id));
      all.add(t.unit.property.currency);
      lines.push(`| ${propName(t.unit.propertyId)} | ${t.name} | ${Array.from(all).join(", ")} |`);
    }
  }
  lines.push(``);

  // ---------------------------------------------------------------
  // Write report + stdout summary
  // ---------------------------------------------------------------
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "scripts", `statement-diagnostic-${ts}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(`\nTenant-statement diagnostic (read-only) — ${properties.length} properties\n`);
  console.log(
    ["Property".padEnd(28), "Unlinked", "Invoices", "Income", "Uninv-months", "Pending", "Classification"].join("  ")
  );
  for (const p of properties) {
    console.log(
      [
        p.name.slice(0, 27).padEnd(28),
        String(unlinkedByProp.get(p.id)?.count ?? 0).padEnd(8),
        String(invoiceCountByProp.get(p.id) ?? 0).padEnd(8),
        String(incomeCountByProp.get(p.id) ?? 0).padEnd(6),
        String(uninvoicedByProp.get(p.id)?.size ?? 0).padEnd(12),
        String(pending.filter((i) => i.tenant.unit.propertyId === p.id).length).padEnd(7),
        classification.get(p.id),
      ].join("  ")
    );
  }
  console.log(`\nReverse orphans (PAID, no IncomeEntry): ${reverseOrphans.length}`);
  console.log(`Tenants with activity predating leaseStart: ${leaseStartAnomalies.length}`);
  console.log(`Multi-currency tenants: ${multiCurrency.length}`);
  console.log(`\n📝 Report: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
