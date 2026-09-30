"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { Download, FileText, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/currency";
import { readApiError } from "@/lib/api-error";
import { exportServiceCharge } from "@/lib/excel-export";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expense-categories";
import { BASIS_LABEL } from "@/lib/service-charge";
import type { ServiceChargeView } from "@/lib/service-charge-data";

const label = (c: string) => (EXPENSE_CATEGORY_LABELS as Record<string, string>)[c] ?? c;

/**
 * The (interim or year-end) statement: each tenant's share of the actual
 * cost for the days they were in, against the service charge billed. Raise
 * balancing invoices for shortfalls; credits are listed for the manager to
 * refund or offset.
 */
export function YearEndTab({ view, onChanged }: { view: ServiceChargeView; onChanged: () => void }) {
  const fmt = (n: number) => formatCurrency(n, view.property.currency);
  const s = view.statement;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/api/service-charge/budgets/${view.budget.id}`;
  const asOf = new Date(s.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chargeable = s.rows.filter((r) => r.balance > 0.005 && !r.balancingInvoice);
  const pickedChargeable = chargeable.filter((r) => picked.has(r.tenantId));

  async function post(path: string, body: unknown, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await readApiError(res, "Something went wrong"));
      return await res.json();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function raise() {
    const d = await post("balancing-invoices", { tenantIds: pickedChargeable.map((r) => r.tenantId) }, "raise");
    if (!d) return;
    if (d.created.length) toast.success(`${d.created.length} balancing invoice${d.created.length === 1 ? "" : "s"} raised as drafts — send them from Invoices`);
    for (const x of d.skipped) toast(`${x.tenantName}: ${x.reason}`);
    setPicked(new Set());
    onChanged();
  }

  async function email() {
    const d = await post("email", { tenantIds: Array.from(picked) }, "email");
    if (!d) return;
    if (d.sent.length) toast.success(`Statement emailed to ${d.sent.length} tenant${d.sent.length === 1 ? "" : "s"}`);
    for (const f of d.failed) toast.error(`${f.tenantName}: ${f.reason}`);
  }

  async function publish(published: boolean) {
    const d = await post("publish", { published }, "publish");
    if (!d) return;
    toast.success(published ? "Statements are now in the tenants' portal" : "Statements withdrawn from the portal");
    onChanged();
  }

  const credits = s.rows.filter((r) => r.balance < -0.005);

  return (
    <div className="space-y-4">
      {!s.yearEnded && (
        <Card padding="sm" className="border border-amber-200 bg-amber-50/60">
          <p className="text-body text-amber-900">
            Interim statement — costs and occupancy to {asOf}. Balancing invoices can be raised once the {view.period.label} service charge year has ended.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Actual cost", fmt(s.actualTotal)],
          ["Billed on account", fmt(s.totals.billed)],
          ["Balancing charges", fmt(s.totals.charges)],
          ["Credits", fmt(s.totals.credits)],
        ].map(([k, v]) => (
          <Card key={k} padding="sm">
            <p className="text-caption text-gray-500">{k}</p>
            <p className="text-h3 text-header tabular-nums mt-1">{v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button size="sm" onClick={raise} loading={busy === "raise"} disabled={!s.yearEnded || pickedChargeable.length === 0}>
            <FileText size={14} className="mr-1" /> Raise balancing invoices{pickedChargeable.length ? ` (${pickedChargeable.length})` : ""}
          </Button>
          <Button size="sm" variant="secondary" onClick={email} loading={busy === "email"} disabled={picked.size === 0}>
            <Mail size={14} className="mr-1" /> Email statements{picked.size ? ` (${picked.size})` : ""}
          </Button>
          <a href={`${base}/statement`} className="inline-flex">
            <Button size="sm" variant="secondary"><Download size={14} className="mr-1" /> PDF</Button>
          </a>
          <Button size="sm" variant="secondary" onClick={() => exportServiceCharge(view, label)}>
            <Download size={14} className="mr-1" /> Excel
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {view.budget.publishedAt ? (
              <>
                <span className="text-caption text-income">In the tenant portal since {new Date(view.budget.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <button onClick={() => publish(false)} disabled={busy !== null} className="text-caption text-gray-400 hover:text-expense">Withdraw</button>
              </>
            ) : (
              <Button size="sm" variant="gold" onClick={() => publish(true)} loading={busy === "publish"}>
                <Send size={14} className="mr-1" /> Publish to portal
              </Button>
            )}
          </div>
        </div>
        <p className="text-caption text-gray-500 mb-3">
          Share = actual cost × the unit&apos;s share ({BASIS_LABEL[view.budget.basisUsed].toLowerCase()}) × days in occupation ÷ {s.daysCovered}.
          Balance = share − service charge billed. Paid is for information — unpaid service charge is chased with the rent arrears.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-left text-caption text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all tenants"
                    checked={s.rows.length > 0 && picked.size === s.rows.length}
                    onChange={(e) => setPicked(e.target.checked ? new Set(s.rows.map((r) => r.tenantId)) : new Set())}
                  />
                </th>
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 font-medium">Tenant</th>
                <th className="py-2 pr-3 font-medium text-right">Days</th>
                <th className="py-2 pr-3 font-medium text-right">Share of cost</th>
                <th className="py-2 pr-3 font-medium text-right">Billed</th>
                <th className="py-2 pr-3 font-medium text-right">Paid</th>
                <th className="py-2 pr-3 font-medium text-right">Balance</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.tenantId} className="border-b border-gray-50">
                  <td className="py-2 pr-2">
                    <input type="checkbox" aria-label={`Select ${r.tenantName}`} checked={picked.has(r.tenantId)} onChange={() => toggle(r.tenantId)} />
                  </td>
                  <td className="py-2 pr-3 font-medium">{r.unitNumber}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/tenants/${r.tenantId}`} className="hover:text-gold-dark">{r.tenantName}</Link>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.days}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.share)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.billed)}</td>
                  <td className={clsx("py-2 pr-3 text-right tabular-nums", r.outstanding > 0.005 ? "text-amber-700" : "text-gray-600")}>{fmt(r.paid)}</td>
                  <td className={clsx("py-2 pr-3 text-right tabular-nums font-medium", r.balance > 0.005 ? "text-expense" : r.balance < -0.005 ? "text-income" : "text-gray-500")}>
                    {r.balance > 0.005 ? `${fmt(r.balance)} due` : r.balance < -0.005 ? `${fmt(-r.balance)} credit` : "—"}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {r.balancingInvoice && (
                      <Link href={`/invoices?focus=${r.balancingInvoice.id}`} className="text-caption text-gold-dark hover:underline mr-2">
                        {r.balancingInvoice.invoiceNumber}
                      </Link>
                    )}
                    <a href={`${base}/statement?tenantId=${r.tenantId}`} className="text-caption text-gray-500 hover:text-gold-dark">PDF</a>
                  </td>
                </tr>
              ))}
              {s.landlord.map((l) => (
                <tr key={l.unitId} className="border-b border-gray-50 text-gray-500">
                  <td />
                  <td className="py-2 pr-3 font-medium">{l.unitNumber}</td>
                  <td className="py-2 pr-3 italic">Landlord (vacant)</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.vacantDays}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(l.share)}</td>
                  <td colSpan={4} className="py-2 text-caption">Paid by the owner — the unit was empty</td>
                </tr>
              ))}
              {s.rows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-gray-400">No tenants in occupation during this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {credits.length > 0 && (
        <Card padding="sm">
          <p className="text-body font-medium text-header">Credits to settle</p>
          <p className="text-caption text-gray-500 mb-2">Not automatic — refund these, or take them off a coming invoice.</p>
          <ul className="text-body space-y-1">
            {credits.map((r) => (
              <li key={r.tenantId} className="flex justify-between gap-3">
                <span>Unit {r.unitNumber} · {r.tenantName}</span>
                <span className="tabular-nums text-income">{fmt(-r.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
