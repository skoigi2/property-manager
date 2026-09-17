"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, FileText, Pencil, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/currency";
import { UTILITY_LABEL } from "@/lib/utility-billing";
import { fmtReading, meterTitle, readError, type ReadingSheet, type SheetRow } from "./types";
import { PhotoStrip } from "./PhotoStrip";

interface Props {
  sheet: ReadingSheet;
  propertyId: string;
  year: number;
  month: number;
  monthLabel: string;
  currency: string;
  onChanged: () => void;
}

interface BillPreview { tenants: number; readings: number; waterAmount: number; electricityAmount: number }
interface BillResult {
  merged: { invoiceId: string; invoiceNumber: string; tenantName: string; status: string; added: number }[];
  created: { invoiceId: string; invoiceNumber: string; tenantName: string; total: number }[];
  errors: { tenantName: string; error: string }[];
}

/**
 * Manager review: the month's readings with the photo beside the typed
 * number, the charge each will produce, and warnings for odd readings.
 * Approve, then bill the approved readings onto next month's invoices.
 */
export function ReviewTab({ sheet, propertyId, year, month, monthLabel, currency, onChanged }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState<SheetRow | null>(null);
  const [voiding, setVoiding] = useState<SheetRow | null>(null);
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [billing, setBilling] = useState(false);
  const [billResult, setBillResult] = useState<BillResult | null>(null);

  // Readings of month M are billed on the invoices of month M+1.
  const invoiceYear = month === 12 ? year + 1 : year;
  const invoiceMonth = month === 12 ? 1 : month + 1;
  const invoiceLabel = new Date(invoiceYear, invoiceMonth - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const rows = useMemo(() => sheet.rows.filter((r) => r.reading), [sheet.rows]);
  const submitted = rows.filter((r) => r.reading!.status === "SUBMITTED");
  const unread = sheet.rows.length - rows.length;
  const missingTariff = (["WATER", "ELECTRICITY"] as const).filter(
    (u) => !sheet.hasTariff[u] && sheet.rows.some((r) => r.utility === u && r.role === "UNIT"),
  );

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/utilities/bill?propertyId=${propertyId}&year=${invoiceYear}&month=${invoiceMonth}`);
      if (res.ok) setPreview(await res.json());
    } catch {
      // The preview is advisory; the bill action reports real failures.
    }
  }, [propertyId, invoiceYear, invoiceMonth]);

  useEffect(() => {
    setSelected(new Set());
    setBillResult(null);
    loadPreview();
  }, [loadPreview, sheet]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const approvable = submitted.filter((r) => !(r.reading!.anomalies ?? []).some((a) => a.code === "NEGATIVE"));
  const allSelected = approvable.length > 0 && approvable.every((r) => selected.has(r.reading!.id));

  async function approve(ids: string[]) {
    if (ids.length === 0) return;
    setApproving(true);
    try {
      const res = await fetch("/api/utilities/readings/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not approve the readings."));
        return;
      }
      const body: { approved: number; errors: { meter: string; error: string }[] } = await res.json();
      if (body.approved) toast.success(`${body.approved} reading${body.approved === 1 ? "" : "s"} approved`);
      if (body.errors.length) {
        toast.error(body.errors.slice(0, 3).map((e) => `${e.meter}: ${e.error}`).join("\n"), { duration: 9000 });
      }
      onChanged();
    } finally {
      setApproving(false);
    }
  }

  async function bill() {
    setBilling(true);
    try {
      const res = await fetch("/api/utilities/bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, year: invoiceYear, month: invoiceMonth }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not bill the readings."));
        return;
      }
      const body: BillResult = await res.json();
      setBillResult(body);
      const n = body.merged.length + body.created.length;
      if (n) toast.success(`Billed ${n} tenant${n === 1 ? "" : "s"}`);
      else if (!body.errors.length) toast("Nothing to bill");
      onChanged();
    } finally {
      setBilling(false);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={`No readings for ${monthLabel} yet`}
        description="Once the caretaker submits the month-end readings they appear here for you to check and approve."
      />
    );
  }

  const pendingTotal = (preview?.waterAmount ?? 0) + (preview?.electricityAmount ?? 0);

  return (
    <div className="space-y-4">
      {missingTariff.length > 0 && (
        <Card padding="sm" className="border border-amber-200 bg-amber-50">
          <p className="text-body text-amber-800 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              No {missingTariff.map((u) => UTILITY_LABEL[u].toLowerCase()).join(" or ")} rate is set for {monthLabel}. Add one under
              Meters &amp; tariffs before approving — a reading can&apos;t be priced without it.
            </span>
          </p>
        </Card>
      )}

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-gray-900">
              {submitted.length} awaiting approval · {rows.length - submitted.length} approved
              {unread > 0 && <span className="text-gray-400 font-normal"> · {unread} meter{unread === 1 ? "" : "s"} not read yet</span>}
            </p>
            <p className="text-caption text-gray-500">Check each number against its photo. Approving fixes the rate and the charge.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setSelected(allSelected ? new Set() : new Set(approvable.map((r) => r.reading!.id)))} disabled={approvable.length === 0}>
            {allSelected ? "Clear selection" : "Select all"}
          </Button>
          <Button size="sm" onClick={() => approve(Array.from(selected))} loading={approving} disabled={selected.size === 0}>
            <CheckCircle2 size={14} className="mr-1" /> Approve {selected.size || ""}
          </Button>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <ReviewCard
            key={row.meterId}
            row={row}
            currency={currency}
            checked={selected.has(row.reading!.id)}
            onToggle={() => toggle(row.reading!.id)}
            onEdit={() => setEditing(row)}
            onVoid={() => setVoiding(row)}
          />
        ))}
      </div>

      {/* Desktop table */}
      <Card padding="none" className="hidden md:block overflow-x-auto">
        <table className="w-full text-body">
          <thead className="bg-gray-50 text-label uppercase text-gray-500">
            <tr>
              <th className="px-3 py-3 w-8" />
              <th className="text-left px-3 py-3">Meter</th>
              <th className="text-left px-3 py-3">Photo</th>
              <th className="text-right px-3 py-3">Previous</th>
              <th className="text-right px-3 py-3">Current</th>
              <th className="text-right px-3 py-3">Used</th>
              <th className="text-right px-3 py-3">Rate</th>
              <th className="text-right px-3 py-3">Charge</th>
              <th className="text-left px-3 py-3">Status</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => {
              const r = row.reading!;
              const negative = (r.anomalies ?? []).some((a) => a.code === "NEGATIVE");
              const rate = r.ratePerUnit ?? r.estimatedRate ?? null;
              const charge = r.status === "APPROVED" ? r.amount ?? null : r.estimatedAmount ?? null;
              return (
                <tr key={row.meterId} className="hover:bg-gray-50/50 transition-colors align-top">
                  <td className="px-3 py-3">
                    {r.status === "SUBMITTED" && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${meterTitle(row)}`}
                        checked={selected.has(r.id)}
                        disabled={negative}
                        onChange={() => toggle(r.id)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-900">{meterTitle(row)}</p>
                    <p className="text-caption text-gray-500">
                      {row.role === "UNIT" ? r.tenantName ?? "Vacant — not billed" : "Not billed · reconciliation only"}
                    </p>
                    <Anomalies row={row} />
                  </td>
                  <td className="px-3 py-3">
                    {r.photoUrls.length ? <PhotoStrip urls={r.photoUrls} size="sm" /> : <span className="text-caption text-gray-300">No photo</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{fmtReading(r.previousReading)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">{fmtReading(r.currentReading)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-medium ${negative ? "text-expense" : "text-gray-900"}`}>
                    {fmtReading(r.consumption)} <span className="text-caption font-normal text-gray-400">{row.unitLabel}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-600">{row.role === "UNIT" && rate != null ? rate.toLocaleString() : "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {row.role === "UNIT" && charge != null ? (
                      <>
                        {formatCurrency(charge, currency)}
                        {r.status === "SUBMITTED" && <span className="block text-caption text-gray-400">estimate</span>}
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3"><StatusBadge row={row} /></td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <RowActions row={row} onEdit={() => setEditing(row)} onVoid={() => setVoiding(row)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Billing */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 text-gray-900">Bill approved readings</h2>
            <p className="text-body text-gray-600 mt-1">
              {preview && preview.tenants > 0 ? (
                <>
                  {preview.readings} approved reading{preview.readings === 1 ? "" : "s"} for {preview.tenants} tenant
                  {preview.tenants === 1 ? "" : "s"} — <span className="font-medium text-gray-900">{formatCurrency(pendingTotal, currency)}</span> — not on an invoice yet.
                </>
              ) : (
                "Every approved reading is already on an invoice."
              )}
            </p>
            <p className="text-caption text-gray-500 mt-1">
              They go onto each tenant&apos;s {invoiceLabel} invoice together with the rent. If that invoice already has a payment, or
              doesn&apos;t exist, a separate water / electricity invoice is raised. Generating {invoiceLabel} rent invoices after approval
              picks the readings up automatically.
            </p>
          </div>
          <Button onClick={bill} loading={billing} disabled={!preview || preview.tenants === 0}>
            <FileText size={14} className="mr-1" /> Bill onto {invoiceLabel}
          </Button>
        </div>

        {billResult && (billResult.merged.length > 0 || billResult.created.length > 0 || billResult.errors.length > 0) && (
          <div className="mt-4 space-y-2 text-body">
            {billResult.merged.length > 0 && (
              <div>
                <p className="font-medium text-gray-900">Added to existing invoices</p>
                <ul className="text-gray-600">
                  {billResult.merged.map((m) => (
                    <li key={m.invoiceId}>
                      <Link href={`/invoices?focus=${m.invoiceId}`} className="text-gold-dark hover:underline">{m.invoiceNumber}</Link> · {m.tenantName} · +
                      {formatCurrency(m.added, currency)}
                      {m.status !== "DRAFT" && <span className="text-amber-700"> — already sent; send it again so the tenant sees the new total</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {billResult.created.length > 0 && (
              <div>
                <p className="font-medium text-gray-900">New water / electricity invoices</p>
                <ul className="text-gray-600">
                  {billResult.created.map((c) => (
                    <li key={c.invoiceId}>
                      <Link href={`/invoices?focus=${c.invoiceId}`} className="text-gold-dark hover:underline">{c.invoiceNumber}</Link> · {c.tenantName} ·{" "}
                      {formatCurrency(c.total, currency)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {billResult.errors.map((e, i) => (
              <p key={i} className="text-expense">{e.tenantName}: {e.error}</p>
            ))}
          </div>
        )}
      </Card>

      {editing && <EditReadingModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {voiding && <VoidReadingModal row={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); onChanged(); }} />}
    </div>
  );
}

function StatusBadge({ row }: { row: SheetRow }) {
  const r = row.reading!;
  if (r.billed) {
    return (
      <Link href={`/invoices?focus=${r.invoiceId}`} className="inline-block">
        <Badge variant="blue">On {r.invoiceNumber}</Badge>
      </Link>
    );
  }
  if (r.status === "APPROVED") return <Badge variant="green">Approved</Badge>;
  return <Badge variant="amber">Awaiting approval</Badge>;
}

function Anomalies({ row }: { row: SheetRow }) {
  const list = row.reading?.anomalies ?? [];
  const override = row.reading?.previousOverrideReason;
  if (!list.length && !override) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {list.map((a) => (
        <p key={a.code} className={`text-caption flex items-start gap-1 ${a.code === "NEGATIVE" ? "text-expense" : "text-amber-700"}`}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {a.message}
        </p>
      ))}
      {override && <p className="text-caption text-gray-500">Previous reading overridden: {override}</p>}
    </div>
  );
}

function RowActions({ row, onEdit, onVoid }: { row: SheetRow; onEdit: () => void; onVoid: () => void }) {
  if (row.locked) return <span className="text-caption text-gray-300">Locked</span>;
  return (
    <span className="inline-flex gap-1">
      {!row.reading!.billed && (
        <button type="button" onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label={`Edit ${meterTitle(row)}`}>
          <Pencil size={14} />
        </button>
      )}
      <button type="button" onClick={onVoid} className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50" aria-label={`Void ${meterTitle(row)}`}>
        <Undo2 size={14} />
      </button>
    </span>
  );
}

function ReviewCard({
  row, currency, checked, onToggle, onEdit, onVoid,
}: { row: SheetRow; currency: string; checked: boolean; onToggle: () => void; onEdit: () => void; onVoid: () => void }) {
  const r = row.reading!;
  const negative = (r.anomalies ?? []).some((a) => a.code === "NEGATIVE");
  const charge = r.status === "APPROVED" ? r.amount ?? null : r.estimatedAmount ?? null;
  return (
    <Card padding="sm">
      <div className="flex items-start gap-2">
        {r.status === "SUBMITTED" && (
          <input type="checkbox" className="mt-1" aria-label={`Select ${meterTitle(row)}`} checked={checked} disabled={negative} onChange={onToggle} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-body font-medium text-gray-900 truncate">{meterTitle(row)}</p>
            <StatusBadge row={row} />
          </div>
          <p className="text-caption text-gray-500">{row.role === "UNIT" ? r.tenantName ?? "Vacant — not billed" : "Not billed"}</p>
          <p className="text-body tabular-nums text-gray-700 mt-1">
            {fmtReading(r.previousReading)} → {fmtReading(r.currentReading)} ={" "}
            <span className={negative ? "text-expense font-medium" : "font-medium text-gray-900"}>{fmtReading(r.consumption)} {row.unitLabel}</span>
            {row.role === "UNIT" && charge != null && <span className="text-gray-500"> · {formatCurrency(charge, currency)}{r.status === "SUBMITTED" ? " est." : ""}</span>}
          </p>
          <Anomalies row={row} />
          <div className="mt-2 flex items-center justify-between gap-2">
            {r.photoUrls.length ? <PhotoStrip urls={r.photoUrls} size="sm" /> : <span className="text-caption text-gray-300">No photo</span>}
            <RowActions row={row} onEdit={onEdit} onVoid={onVoid} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function EditReadingModal({ row, onClose, onSaved }: { row: SheetRow; onClose: () => void; onSaved: () => void }) {
  const r = row.reading!;
  const [current, setCurrent] = useState(String(r.currentReading));
  const [overridePrev, setOverridePrev] = useState(!!r.previousOverrideReason);
  const [previous, setPrevious] = useState(String(r.previousReading));
  const [reason, setReason] = useState(r.previousOverrideReason ?? "");
  const [notes, setNotes] = useState(r.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { currentReading: Number(current), notes };
      if (overridePrev) {
        body.previousOverride = Number(previous);
        body.previousOverrideReason = reason;
      } else if (r.previousOverrideReason) {
        body.previousOverride = null; // back to the derived previous reading
      }
      const res = await fetch(`/api/utilities/readings/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not save the reading."));
        return;
      }
      toast.success(r.status === "APPROVED" ? "Saved — the reading needs approving again" : "Reading saved");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit reading — ${meterTitle(row)}`}>
      <div className="space-y-4">
        {r.photoUrls.length > 0 && <PhotoStrip urls={r.photoUrls} />}
        <Input label="Current reading" type="number" step="any" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <label className="flex items-start gap-2 text-body text-gray-700">
          <input type="checkbox" className="mt-1" checked={overridePrev} onChange={(e) => setOverridePrev(e.target.checked)} />
          <span>
            Override the previous reading
            <span className="block text-caption text-gray-500">Only when the meter was replaced or rolled over. Normally it is taken from last month.</span>
          </span>
        </label>
        {overridePrev && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Previous reading" type="number" step="any" min={0} value={previous} onChange={(e) => setPrevious(e.target.value)} />
            <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Meter replaced on 12 Jun" />
          </div>
        )}
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function VoidReadingModal({ row, onClose, onDone }: { row: SheetRow; onClose: () => void; onDone: () => void }) {
  const r = row.reading!;
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/utilities/readings/${r.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not void the reading."));
        return;
      }
      const body: { invoice: { invoiceNumber: string; cancelled: boolean } | null } = await res.json();
      toast.success(
        body.invoice
          ? body.invoice.cancelled
            ? `Reading voided — invoice ${body.invoice.invoiceNumber} was cancelled`
            : `Reading voided — invoice ${body.invoice.invoiceNumber} reduced`
          : "Reading voided",
      );
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Void reading — ${meterTitle(row)}`} size="sm">
      <div className="space-y-4">
        <p className="text-body text-gray-600">
          The reading is withdrawn and the meter can be read again for this month.
          {r.billed && ` It is on invoice ${r.invoiceNumber}; the invoice total is reduced to match.`}
        </p>
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong meter read" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={saving} disabled={reason.trim().length < 3}>Void reading</Button>
        </div>
      </div>
    </Modal>
  );
}
