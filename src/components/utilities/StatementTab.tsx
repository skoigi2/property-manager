"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, Download, FileText, Mail } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import { exportUtilityStatement, type UtilityStatementExportRow } from "@/lib/excel-export";
import { periodLabel } from "@/lib/utility-statement";
import { readError } from "./types";

interface Figures { billed: number; paid: number; unpaid: number }
interface StatementRow extends UtilityStatementExportRow {
  tenantId: string;
  invoices: (UtilityStatementExportRow["invoices"][number] & { invoiceId: string })[];
}
interface StatementResponse {
  property: { id: string; name: string; currency: string };
  rangeLabel: string;
  rows: StatementRow[];
  totals: { water: Figures; electricity: Figures; totalUnpaid: number; notYetInvoiced: number; tenantsOwing: number };
}

type Preset = "all" | "year" | "12m" | "custom";

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * The property's water & electricity position, tenant by tenant: what was
 * billed, what has been paid and what is still owed — the list the manager
 * chases from. Paid / unpaid follows the payment order on each invoice (rent,
 * then water, then electricity).
 */
export function StatementTab({ propertyId, currency }: { propertyId: string; currency: string }) {
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(true);
  const [data, setData] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const query = useMemo(() => {
    const qs = new URLSearchParams({ propertyId });
    const now = new Date();
    if (preset === "year") {
      qs.set("from", `${now.getFullYear()}-01`);
      qs.set("to", ym(now));
    } else if (preset === "12m") {
      qs.set("from", ym(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
      qs.set("to", ym(now));
    } else if (preset === "custom") {
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
    }
    if (unpaidOnly) qs.set("unpaidOnly", "true");
    return qs.toString();
  }, [propertyId, preset, from, to, unpaidOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/utilities/statement?${query}`);
      if (!res.ok) throw new Error(await readError(res, "Failed to load the statement"));
      setData(await res.json());
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the statement");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const owing = data?.rows.filter((r) => r.totalUnpaid > 0) ?? [];
  const allSelected = owing.length > 0 && owing.every((r) => selected.has(r.tenantId));

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function sendReminders() {
    setSending(true);
    try {
      const res = await fetch("/api/utilities/statement/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, tenantIds: Array.from(selected) }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not send the reminders."));
        return;
      }
      const body: { sent: number; failed: number; failedDetails: { tenant: string; error: string }[] } = await res.json();
      if (body.sent) toast.success(`${body.sent} reminder${body.sent === 1 ? "" : "s"} emailed`);
      if (body.failed) {
        toast.error(body.failedDetails.slice(0, 4).map((f) => `${f.tenant}: ${f.error}`).join("\n"), { duration: 9000 });
      }
      setSelected(new Set());
    } finally {
      setSending(false);
    }
  }

  const fmt = (n: number) => formatCurrency(n, data?.property.currency ?? currency);

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {([["all", "All invoices"], ["year", "This year"], ["12m", "Last 12 months"], ["custom", "Custom"]] as [Preset, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className={`px-3 py-1.5 text-caption font-medium transition-colors ${preset === k ? "bg-header text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <>
              <input type="month" aria-label="From month" value={from} onChange={(e) => setFrom(e.target.value)} className="text-body border border-gray-200 rounded-lg px-2 py-1.5 bg-cream" />
              <span className="text-caption text-gray-400">to</span>
              <input type="month" aria-label="To month" value={to} onChange={(e) => setTo(e.target.value)} className="text-body border border-gray-200 rounded-lg px-2 py-1.5 bg-cream" />
            </>
          )}
          <label className="flex items-center gap-2 text-body text-gray-700 ml-1">
            <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
            Owing only
          </label>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!data || data.rows.length === 0}
              onClick={() => data && exportUtilityStatement(data.rows, { propertyName: data.property.name, rangeLabel: data.rangeLabel, currency: data.property.currency })}
            >
              <Download size={14} className="mr-1" /> Excel
            </Button>
            <a
              href={`/api/utilities/statement?${query}&format=pdf`}
              className={`inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-body font-medium text-gray-700 hover:bg-gray-50 ${!data || data.rows.length === 0 ? "pointer-events-none opacity-50" : ""}`}
            >
              <FileText size={14} className="mr-1" /> PDF
            </a>
          </div>
        </div>
      </Card>

      {loading && !data ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title={unpaidOnly ? "Nobody owes water or electricity" : "No water or electricity invoiced yet"}
          description={unpaidOnly ? "Every utility invoice in this period is paid. Untick “Owing only” to see the full history." : "Bills appear here once approved meter readings have gone onto an invoice."}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card padding="sm">
              <p className="text-label uppercase text-gray-400">Water</p>
              <p className="text-h2 tabular-nums text-gray-900">{fmt(data.totals.water.billed)}</p>
              <p className="text-caption text-gray-500">Paid {fmt(data.totals.water.paid)} · <span className={data.totals.water.unpaid > 0 ? "text-expense font-medium" : ""}>unpaid {fmt(data.totals.water.unpaid)}</span></p>
            </Card>
            <Card padding="sm">
              <p className="text-label uppercase text-gray-400">Electricity</p>
              <p className="text-h2 tabular-nums text-gray-900">{fmt(data.totals.electricity.billed)}</p>
              <p className="text-caption text-gray-500">Paid {fmt(data.totals.electricity.paid)} · <span className={data.totals.electricity.unpaid > 0 ? "text-expense font-medium" : ""}>unpaid {fmt(data.totals.electricity.unpaid)}</span></p>
            </Card>
            <Card padding="sm">
              <p className="text-label uppercase text-gray-400">To collect</p>
              <p className={`text-h2 tabular-nums ${data.totals.totalUnpaid > 0 ? "text-expense" : "text-income"}`}>{fmt(data.totals.totalUnpaid)}</p>
              <p className="text-caption text-gray-500">
                {data.totals.tenantsOwing} tenant{data.totals.tenantsOwing === 1 ? "" : "s"} owing
                {data.totals.notYetInvoiced > 0 && ` · ${fmt(data.totals.notYetInvoiced)} approved, not invoiced yet`}
              </p>
            </Card>
          </div>

          {owing.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelected(allSelected ? new Set() : new Set(owing.map((r) => r.tenantId)))}>
                {allSelected ? "Clear selection" : "Select everyone owing"}
              </Button>
              <Button size="sm" onClick={sendReminders} loading={sending} disabled={selected.size === 0}>
                <Mail size={14} className="mr-1" /> Email reminder{selected.size === 1 ? "" : "s"} {selected.size ? `(${selected.size})` : ""}
              </Button>
              <span className="text-caption text-gray-500">The email lists each unpaid water / electricity invoice. It is logged on the tenant&apos;s Comms tab.</span>
            </div>
          )}

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {data.rows.map((r) => (
              <Card key={r.tenantId} padding="sm">
                <div className="flex items-start gap-2">
                  {r.totalUnpaid > 0 && (
                    <input type="checkbox" className="mt-1" aria-label={`Select ${r.tenantName}`} checked={selected.has(r.tenantId)} onChange={() => setSelected((s) => toggle(s, r.tenantId))} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/tenants/${r.tenantId}`} className="text-body font-medium text-gray-900 truncate hover:text-gold">
                        Unit {r.unitNumber} · {r.tenantName}
                      </Link>
                      <span className={`text-body tabular-nums font-medium ${r.totalUnpaid > 0 ? "text-expense" : "text-income"}`}>{fmt(r.totalUnpaid)}</span>
                    </div>
                    <p className="text-caption text-gray-500">
                      {r.phone ?? "No phone"}{!r.isActive && " · vacated"}
                      {r.oldestUnpaidPeriod && ` · unpaid since ${periodLabel(r.oldestUnpaidPeriod)}`}
                    </p>
                    <p className="text-caption text-gray-600 mt-1 tabular-nums">
                      Water {fmt(r.water.unpaid)} of {fmt(r.water.billed)} · Power {fmt(r.electricity.unpaid)} of {fmt(r.electricity.billed)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card padding="none" className="hidden md:block overflow-x-auto">
            <table className="w-full text-body">
              <thead className="bg-gray-50 text-label uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-3 w-8" />
                  <th className="text-left px-3 py-3">Tenant</th>
                  <th className="text-right px-3 py-3">Water billed</th>
                  <th className="text-right px-3 py-3">Water unpaid</th>
                  <th className="text-right px-3 py-3">Power billed</th>
                  <th className="text-right px-3 py-3">Power unpaid</th>
                  <th className="text-right px-3 py-3">Total unpaid</th>
                  <th className="text-left px-3 py-3">Unpaid since</th>
                  <th className="text-left px-3 py-3">Last payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.rows.map((r) => (
                  <Fragment key={r.tenantId}>
                    <tr className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-3">
                        {r.totalUnpaid > 0 && (
                          <input type="checkbox" aria-label={`Select ${r.tenantName}`} checked={selected.has(r.tenantId)} onChange={() => setSelected((s) => toggle(s, r.tenantId))} />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setOpen((s) => toggle(s, r.tenantId))} className="flex items-center gap-1 text-left" aria-expanded={open.has(r.tenantId)}>
                          {open.has(r.tenantId) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                          <span className="font-medium text-gray-900">Unit {r.unitNumber} · {r.tenantName}</span>
                          {!r.isActive && <Badge variant="gray">Vacated</Badge>}
                        </button>
                        <p className="text-caption text-gray-500 pl-5">
                          {r.phone ?? "No phone"}{r.email ? "" : " · no email"}
                          {r.notYetInvoiced > 0 && ` · ${fmt(r.notYetInvoiced)} not invoiced yet`}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(r.water.billed)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${r.water.unpaid > 0 ? "text-expense font-medium" : "text-gray-400"}`}>{fmt(r.water.unpaid)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmt(r.electricity.billed)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${r.electricity.unpaid > 0 ? "text-expense font-medium" : "text-gray-400"}`}>{fmt(r.electricity.unpaid)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums font-medium ${r.totalUnpaid > 0 ? "text-expense" : "text-income"}`}>{fmt(r.totalUnpaid)}</td>
                      <td className="px-3 py-3 text-gray-600">{r.oldestUnpaidPeriod ? `${periodLabel(r.oldestUnpaidPeriod)} · ${r.unpaidInvoices} inv.` : "—"}</td>
                      <td className="px-3 py-3 text-caption text-gray-500">
                        {r.lastPaymentDate ? new Date(r.lastPaymentDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                    </tr>
                    {open.has(r.tenantId) &&
                      r.invoices.map((i) => (
                        <tr key={i.invoiceId} className="bg-gray-50/60 text-caption">
                          <td />
                          <td className="px-3 py-2 pl-8">
                            <Link href={`/invoices?focus=${i.invoiceId}`} className="text-gold-dark hover:underline">{i.invoiceNumber}</Link>
                            <span className="text-gray-500"> · {periodLabel(`${i.periodYear}-${String(i.periodMonth).padStart(2, "0")}`)}</span>
                            {i.overdue && <Badge variant="red" className="ml-2">Overdue</Badge>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(i.water.billed)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${i.water.unpaid > 0 ? "text-expense" : "text-gray-400"}`}>{fmt(i.water.unpaid)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmt(i.electricity.billed)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${i.electricity.unpaid > 0 ? "text-expense" : "text-gray-400"}`}>{fmt(i.electricity.unpaid)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(i.water.unpaid + i.electricity.unpaid)}</td>
                          <td className="px-3 py-2 text-gray-500" colSpan={2}>
                            Due {new Date(i.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {i.status.replace(/_/g, " ").toLowerCase()}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-caption text-gray-400">
            A payment settles the rent first, then water, then electricity — so an invoice paid short shows its balance against the utilities.
          </p>
        </>
      )}
    </div>
  );
}
