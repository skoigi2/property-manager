import "server-only";
import { prisma } from "@/lib/prisma";
import { esc, sendNotificationEmail } from "@/lib/email";
import { isTenantUncontactable } from "@/lib/tenant-contact";

/**
 * Data health — read-only integrity checks across every organisation. Each is
 * a rule the app relies on but the database can't enforce; a hit means a
 * screen somewhere shows the wrong figure. Run by `npm run data:health`
 * (scripts/data-health.ts, local or `npm run prod --`) and weekly by the cron,
 * which emails platform super-admins when anything turns up.
 */
export interface DataHealthCheck {
  name: string;
  why: string;
  sql: (demoFilter: string) => string;
  /** Optional row filter for rules SQL can't express (e.g. phone validity); `_`-prefixed columns are dropped after it. */
  keep?: (row: Record<string, unknown>) => boolean;
}

export interface DataHealthResult {
  name: string;
  why: string;
  rows: Record<string, unknown>[];
}

export const DATA_HEALTH_CHECKS: DataHealthCheck[] = [
  {
    name: "Invoice receipts ≠ paid amount",
    why: "Every payment books receipts linked to the invoice (the allocator); a gap means the ledger and the invoice disagree on what the tenant paid.",
    sql: (demoFilter) => `
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
    why: "The tenant ledger and arrears match rent receipts — and service charge receipts of an owner, or of a tenant whose charges include service charge — by tenant; one with no tenant, dated inside such a tenancy of that unit, is invisible to them.",
    sql: (demoFilter) => `
      select o.name as org, p.name as property, u."unitNumber" as ref, e.date::date::text as date, e."grossAmount"::float as amount
      from "IncomeEntry" e join "Unit" u on u.id = e."unitId" join "Property" p on p.id = u."propertyId"
      left join "Organization" o on o.id = p."organizationId"
      where e.type in ('LONGTERM_RENT', 'SERVICE_CHARGE') and e."tenantId" is null ${demoFilter}
        and exists (select 1 from "Tenant" t where t."unitId" = u.id and t."leaseStart" <= e.date
                    and coalesce(t."vacatedDate", case when t."isActive" then null else t."leaseEnd" end, 'infinity'::timestamp) >= e.date
                    -- A service charge receipt only counts for an owner or a tenant billed service charge (countsTowardRentSide).
                    and (e.type = 'LONGTERM_RENT' or t."isUnitOwner" or t."serviceCharge" > 0))`,
  },
  {
    name: "Unit status ≠ occupancy",
    why: "Occupancy, vacancy reminders and the rent roll read Unit.status; it should be VACANT exactly when no tenant is active.",
    sql: (demoFilter) => `
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
    sql: () => `
      select 'ExpenseEntry' as ref, count(*)::int as rows from "ExpenseEntry"
        where "propertyId" is null and "unitId" is null and "organizationId" is null having count(*) > 0
      union all
      select 'PettyCash', count(*)::int from "PettyCash"
        where "propertyId" is null and "organizationId" is null having count(*) > 0`,
  },
  {
    name: "Properties with no organisation",
    why: "Every org-scoped screen filters by organisation, so a property without one is visible only to a super-admin.",
    sql: () => `
      select p.name as property, p.id as ref, p."createdAt"::date::text as created, p."isDemo" as sample,
             (select count(*) from "Unit" u where u."propertyId" = p.id)::int as units
      from "Property" p where p."organizationId" is null`,
  },
  {
    name: "Paid owner invoices without income",
    why: "Marking an owner invoice PAID books its fee income; without it the manager's revenue is understated.",
    sql: (demoFilter) => `
      select o.name as org, p.name as property, oi."invoiceNumber" as ref, oi.type::text as type, oi."totalAmount"::float as total
      from "OwnerInvoice" oi join "Property" p on p.id = oi."propertyId" left join "Organization" o on o.id = p."organizationId"
      where oi.status = 'PAID' ${demoFilter}
        and not exists (select 1 from "IncomeEntry" e where e."ownerInvoiceId" = oi.id)`,
  },
  {
    name: "Active tenants past their lease end with no renewal",
    why: "Not wrong data as such, but these leases have lapsed — renew, vacate or mark the tenant month-to-month (Inbox / tenant page).",
    sql: (demoFilter) => `
      select o.name as org, p.name as property, u."unitNumber" as ref, t.name as tenant, t."leaseEnd"::date::text as lease_end
      from "Tenant" t join "Unit" u on u.id = t."unitId" join "Property" p on p.id = u."propertyId"
      left join "Organization" o on o.id = p."organizationId"
      where t."isActive" and not t."monthToMonth" and t."leaseEnd" < now() - interval '30 days' and t."renewalStage" <> 'RENEWED' ${demoFilter}`,
  },
  {
    name: "Active tenants who can't be contacted",
    why: "No email and no phone number WhatsApp can use, so no reminder, receipt or reply ever reaches them — add one on the tenant page (Tenants list → Can't be contacted).",
    sql: (demoFilter) => `
      select o.name as org, p.name as property, u."unitNumber" as ref, t.name as tenant, t.phone as phone,
             t.email as _email, p.currency as _currency
      from "Tenant" t join "Unit" u on u.id = t."unitId" join "Property" p on p.id = u."propertyId"
      left join "Organization" o on o.id = p."organizationId"
      where t."isActive" ${demoFilter}`,
    keep: (r) => isTenantUncontactable({ email: r._email as string | null, phone: r.phone as string | null }, r._currency as string | null),
  },
];

/** Runs every check (sample properties skipped unless `includeDemos`). */
export async function runDataHealthChecks(opts: { includeDemos?: boolean } = {}): Promise<DataHealthResult[]> {
  const demoFilter = opts.includeDemos ? "" : `and coalesce(p."isDemo", false) = false`;
  const results: DataHealthResult[] = [];
  for (const c of DATA_HEALTH_CHECKS) {
    let rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(c.sql(demoFilter));
    if (c.keep) {
      rows = rows
        .filter(c.keep)
        .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))));
    }
    results.push({ name: c.name, why: c.why, rows });
  }
  return results;
}

const REPORT_SUBJECT = "Data health:";

/**
 * Weekly (Mondays, UTC) from the daily cron: emails the platform
 * super-admins a report when any check finds rows; silent when all clean.
 * At most one report per 6 days, so a re-run cron doesn't resend.
 */
export async function sendWeeklyDataHealthReport(now: Date = new Date()): Promise<{ skipped?: string; failing?: number; sentTo?: number }> {
  if (now.getUTCDay() !== 1) return { skipped: "not Monday" };
  const recent = await prisma.emailLog.findFirst({
    where: { subject: { startsWith: REPORT_SUBJECT }, sentAt: { gte: new Date(now.getTime() - 6 * 86400_000) } },
    select: { id: true },
  });
  if (recent) return { skipped: "already sent this week" };

  const results = await runDataHealthChecks();
  const failing = results.filter((r) => r.rows.length > 0);
  if (failing.length === 0) return { failing: 0 };

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", organizationId: null, email: { not: "" } },
    select: { id: true, email: true },
  });
  const subject = `${REPORT_SUBJECT} ${failing.length} check${failing.length === 1 ? "" : "s"} found rows`;
  const html = renderDataHealthReport(results);
  for (const a of admins) {
    if (a.email) await sendNotificationEmail(a.email, subject, html, { userId: a.id });
  }
  return { failing: failing.length, sentTo: admins.length };
}

export function renderDataHealthReport(results: DataHealthResult[]): string {
  const cell = (v: unknown) => `<td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(v == null ? "" : String(v))}</td>`;
  const sections = results.map((r) => {
    if (r.rows.length === 0) return `<p style="margin:4px 0;color:#2e7d32">✓ ${esc(r.name)}</p>`;
    const head = `<tr>${Object.keys(r.rows[0]).map((k) => `<th style="padding:4px 8px;text-align:left;color:#555;border-bottom:1px solid #ccc">${esc(k)}</th>`).join("")}</tr>`;
    const rows = head + r.rows.slice(0, 25).map((row) => `<tr>${Object.values(row).map(cell).join("")}</tr>`).join("");
    const more = r.rows.length > 25 ? `<p style="color:#666">… and ${r.rows.length - 25} more</p>` : "";
    return `<h3 style="margin:16px 0 4px;color:#c62828">✗ ${esc(r.name)} — ${r.rows.length}</h3>
      <p style="margin:0 0 6px;color:#555">${esc(r.why)}</p>
      <table style="border-collapse:collapse;font-size:13px">${rows}</table>${more}`;
  });
  return `<div style="font-family:Arial,sans-serif;font-size:14px">
    <p>Weekly data health check across every organisation (sample properties excluded).</p>
    ${sections.join("\n")}
    <p style="color:#666;margin-top:16px">Re-run any time: <code>npm run prod -- npm run data:health</code></p>
  </div>`;
}
