/**
 * Data health report — read-only integrity checks across every organisation.
 *
 *   npm run data:health                     (local DB)
 *   npm run prod -- npm run data:health     (production)
 *   … -- --include-demos                    (sample properties too; skipped by default)
 *
 * Each check is a rule the app relies on but the database can't enforce;
 * a hit means a screen somewhere shows the wrong figure. Exits 1 when any
 * check finds rows, so it can gate a deploy or a cron.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const includeDemos = process.argv.includes("--include-demos");
const demoFilter = includeDemos ? "" : `and coalesce(p."isDemo", false) = false`;

interface Check {
  name: string;
  why: string;
  sql: string;
}

const CHECKS: Check[] = [
  {
    name: "Invoice receipts ≠ paid amount",
    why: "Every payment books receipts linked to the invoice (the allocator); a gap means the ledger and the invoice disagree on what the tenant paid.",
    sql: `
      select o.name as org, p.name as property, i."invoiceNumber" as ref, i.status::text as status,
             coalesce(i."paidAmount", case when i.status = 'PAID' then i."totalAmount" else 0 end)::float as paid,
             coalesce(sum(e."grossAmount"), 0)::float as received
      from "Invoice" i
      join "Tenant" t on t.id = i."tenantId" join "Unit" u on u.id = t."unitId" join "Property" p on p.id = u."propertyId"
      left join "Organization" o on o.id = p."organizationId"
      left join "IncomeEntry" e on e."invoiceId" = i.id
      where true ${demoFilter}
      group by o.name, p.name, i.id
      having abs(coalesce(i."paidAmount", case when i.status = 'PAID' then i."totalAmount" else 0 end) - coalesce(sum(e."grossAmount"), 0)) > 0.01`,
  },
  {
    name: "Rent receipts without a tenant",
    why: "The tenant ledger and arrears match LONGTERM_RENT receipts by tenant; one with no tenant, dated inside a tenancy of that unit, is invisible to them.",
    sql: `
      select o.name as org, p.name as property, u."unitNumber" as ref, e.date::date::text as date, e."grossAmount"::float as amount
      from "IncomeEntry" e join "Unit" u on u.id = e."unitId" join "Property" p on p.id = u."propertyId"
      left join "Organization" o on o.id = p."organizationId"
      where e.type = 'LONGTERM_RENT' and e."tenantId" is null ${demoFilter}
        and exists (select 1 from "Tenant" t where t."unitId" = u.id and t."leaseStart" <= e.date
                    and coalesce(t."vacatedDate", case when t."isActive" then null else t."leaseEnd" end, 'infinity'::timestamp) >= e.date)`,
  },
  {
    name: "Unit status ≠ occupancy",
    why: "Occupancy, vacancy reminders and the rent roll read Unit.status; it should be VACANT exactly when no tenant is active.",
    sql: `
      select o.name as org, p.name as property, u."unitNumber" as ref, u.status::text as status,
             (select count(*) from "Tenant" t where t."unitId" = u.id and t."isActive")::int as active_tenants
      from "Unit" u join "Property" p on p.id = u."propertyId" left join "Organization" o on o.id = p."organizationId"
      where p.type = 'LONGTERM' ${demoFilter}
        and ((u.status = 'VACANT' and exists (select 1 from "Tenant" t where t."unitId" = u.id and t."isActive"))
          or (u.status = 'ACTIVE' and not exists (select 1 from "Tenant" t where t."unitId" = u.id and t."isActive")))`,
  },
  {
    name: "Property-less rows with no organisation",
    why: "Expenses and petty cash without a property are scoped by organizationId and fail closed — a row with neither is visible to nobody.",
    sql: `
      select 'ExpenseEntry' as ref, count(*)::int as rows from "ExpenseEntry"
        where "propertyId" is null and "unitId" is null and "organizationId" is null having count(*) > 0
      union all
      select 'PettyCash', count(*)::int from "PettyCash"
        where "propertyId" is null and "organizationId" is null having count(*) > 0`,
  },
  {
    name: "Paid owner invoices without income",
    why: "Marking an owner invoice PAID books its fee income; without it the manager's revenue is understated.",
    sql: `
      select o.name as org, p.name as property, oi."invoiceNumber" as ref, oi.type::text as type, oi."totalAmount"::float as total
      from "OwnerInvoice" oi join "Property" p on p.id = oi."propertyId" left join "Organization" o on o.id = p."organizationId"
      where oi.status = 'PAID' ${demoFilter}
        and not exists (select 1 from "IncomeEntry" e where e."ownerInvoiceId" = oi.id)`,
  },
  {
    name: "Active tenants past their lease end with no renewal",
    why: "Not wrong data as such, but these leases have lapsed — renew, vacate or mark the tenant month-to-month (Inbox / tenant page).",
    sql: `
      select o.name as org, p.name as property, u."unitNumber" as ref, t.name as tenant, t."leaseEnd"::date::text as lease_end
      from "Tenant" t join "Unit" u on u.id = t."unitId" join "Property" p on p.id = u."propertyId"
      left join "Organization" o on o.id = p."organizationId"
      where t."isActive" and not t."monthToMonth" and t."leaseEnd" < now() - interval '30 days' and t."renewalStage" <> 'RENEWED' ${demoFilter}`,
  },
];

async function main() {
  console.log(`Data health — ${includeDemos ? "including" : "excluding"} sample properties\n`);
  let failing = 0;
  for (const c of CHECKS) {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(c.sql);
    if (rows.length === 0) {
      console.log(`ok    ${c.name}`);
      continue;
    }
    failing++;
    console.log(`FAIL  ${c.name} — ${rows.length}\n      ${c.why}`);
    for (const r of rows.slice(0, 15)) console.log(`      · ${Object.values(r).join(" | ")}`);
    if (rows.length > 15) console.log(`      … and ${rows.length - 15} more`);
  }
  console.log(failing ? `\n${failing} check(s) found rows` : "\nAll checks clean");
  await prisma.$disconnect();
  if (failing) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
