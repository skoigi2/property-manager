/**
 * Demo seed smoke check: seeds every demo into a throwaway organisation,
 * checks the data reads the way the demo intends under the app's own rules,
 * then deletes it all again.
 *
 *   npx tsx scripts/demo-smoke.ts            (local DB from .env)
 *   npx tsx scripts/demo-smoke.ts --keep     (leave the org for a look; prints its id)
 *
 * Checks, per demo:
 *  - arrears: only the tenants the seed puts in arrears are in arrears, for
 *    exactly the months it intends (computeArrears — the tenant ledger / Income
 *    Arrears rule, incl. service charge)
 *  - every invoice's linked receipts add up to its paid amount (a PAID invoice
 *    with paidAmount null counts as its total)
 *  - Kilimani Court: unit meters, approved readings, this year's service
 *    charge budget
 *
 * Run it after changing a demo seed or a rule the demos are read by. Exits 1
 * on any failure.
 */
import "./server-only-shim";

/** Units each seed puts in arrears on purpose, and for how many months. */
const EXPECTED_ARREARS: Record<string, Record<string, number>> = {
  "al-seef": { "102": 2, "304": 1 },
  "kilimani-court": { "103": 2 },
  "sandton-heights": { "102": 3, "302": 2 },
  "belsize-court": { "201": 2, "302": 3 },
};

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { seedDemoProperty } = await import("@/lib/demo-seed");
  const { deletePropertyOps } = await import("@/lib/property-delete");
  const { computeArrears } = await import("@/lib/rent-ledger");
  const keep = process.argv.includes("--keep");

  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) failures.push(what);
  };

  const org = await prisma.organization.create({ data: { name: `Demo smoke ${new Date().toISOString()}` } });
  const propertyIds: string[] = [];
  try {
    for (const [key, expected] of Object.entries(EXPECTED_ARREARS)) {
      const started = Date.now();
      const seeded = await seedDemoProperty(key, org.id);
      if (!seeded) {
        check(false, `${key}: no seed`);
        continue;
      }
      propertyIds.push(seeded.id);
      console.log(`\n${key} (seeded in ${Math.round((Date.now() - started) / 1000)} s)`);

      // ── Arrears ──────────────────────────────────────────────────────────
      const tenants = await prisma.tenant.findMany({
        where: { unit: { propertyId: seeded.id }, isActive: true },
        select: {
          id: true, unitId: true, leaseStart: true, leaseEnd: true, monthlyRent: true, serviceCharge: true, paymentFrequency: true,
          unit: { select: { unitNumber: true } },
          rentHistory: { select: { monthlyRent: true, effectiveDate: true, appliedAt: true } },
          incomeEntries: { select: { type: true, date: true, grossAmount: true, tenantId: true, unitId: true } },
        },
      });
      const actual: Record<string, number> = {};
      for (const t of tenants) {
        const a = computeArrears(t, t.incomeEntries);
        if (a.hasArrears) actual[t.unit.unitNumber] = a.unpaidMonths.length;
      }
      const fmt = (m: Record<string, number>) =>
        Object.keys(m).sort().map((u) => `${u}×${m[u]}`).join(", ") || "none";
      check(fmt(actual) === fmt(expected), `arrears ${fmt(actual)} (expected ${fmt(expected)})`);

      // ── Invoice ↔ receipts ───────────────────────────────────────────────
      const invoices = await prisma.invoice.findMany({
        where: { tenant: { unit: { propertyId: seeded.id } } },
        select: { invoiceNumber: true, status: true, totalAmount: true, paidAmount: true, incomeEntries: { select: { grossAmount: true } } },
      });
      const mismatched = invoices.filter((inv) => {
        const paid = inv.paidAmount ?? (inv.status === "PAID" ? inv.totalAmount : 0);
        const received = inv.incomeEntries.reduce((s, e) => s + e.grossAmount, 0);
        return Math.abs(paid - received) > 0.01;
      });
      check(
        mismatched.length === 0,
        `${invoices.length} invoices: receipts match the paid amount` +
          (mismatched.length ? ` — ${mismatched.length} don't, e.g. ${mismatched.slice(0, 3).map((i) => i.invoiceNumber).join(", ")}` : ""),
      );

      // ── Al Seef: Wi-Fi billed on the invoice, booked as a Wi-Fi recovery ──
      if (key === "al-seef") {
        const [wifiReceipts, rentReceiptsWithWifi] = await Promise.all([
          prisma.incomeEntry.count({ where: { unit: { propertyId: seeded.id }, type: "UTILITY_RECOVERY", utilityType: "WIFI" } }),
          prisma.invoice.count({ where: { tenant: { unit: { propertyId: seeded.id } }, wifiAmount: { gt: 0 } } }),
        ]);
        check(wifiReceipts > 0 && rentReceiptsWithWifi > 0, `${rentReceiptsWithWifi} invoices with Wi-Fi, ${wifiReceipts} Wi-Fi receipts`);
      }

      // ── Kilimani extras ──────────────────────────────────────────────────
      if (key === "kilimani-court") {
        const [meters, approved, budget] = await Promise.all([
          prisma.utilityMeter.count({ where: { propertyId: seeded.id, role: "UNIT" } }),
          prisma.meterReading.count({ where: { meter: { propertyId: seeded.id }, status: "APPROVED" } }),
          prisma.serviceChargeBudget.count({ where: { propertyId: seeded.id, year: new Date().getFullYear() } }),
        ]);
        check(meters > 0 && approved > 0, `${meters} unit meters, ${approved} approved readings`);
        check(budget === 1, `this year's service charge budget`);
      }
    }
  } finally {
    if (keep) {
      console.log(`\nKept organisation ${org.id} ("${org.name}")`);
    } else {
      for (const id of propertyIds) await prisma.$transaction(deletePropertyOps(id));
      await prisma.organization.delete({ where: { id: org.id } });
    }
    await prisma.$disconnect();
  }

  console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nAll demo checks passed");
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
