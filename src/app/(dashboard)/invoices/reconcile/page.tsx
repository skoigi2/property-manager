"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChevronLeft, Upload, Wand2, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import toast from "react-hot-toast";

import { parseStatement, type ParsedLine } from "@/lib/statement-parser";

// ─── Types from the preview API ──────────────────────────────────────────────

interface Candidate {
  invoiceId: string;
  invoiceNumber: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  currency: string;
  outstanding: number;
  totalAmount: number;
  score: number;
  exactAmount: boolean;
}

interface LineResult { id: number; candidates: Candidate[]; autoSelect: string | null }

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ReconcilePage() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [results, setResults] = useState<Map<number, LineResult>>(new Map());
  const [selection, setSelection] = useState<Map<number, string | "">>(new Map());
  const [matching, setMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<{ applied: number; paid: number; failed: number } | null>(null);

  async function handleFile(f: File) {
    setRaw(await f.text());
  }

  async function runMatch() {
    const parsed = parseStatement(raw);
    if (parsed.length === 0) {
      toast.error("No credit lines found — check the pasted statement");
      return;
    }
    if (parsed.length > 200) {
      toast.error("Too many lines — reconcile at most 200 at a time");
      return;
    }
    setMatching(true);
    setDone(null);
    try {
      const res = await fetch("/api/invoices/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Matching failed");
      const map = new Map<number, LineResult>();
      const sel = new Map<number, string | "">();
      for (const r of json.results as LineResult[]) {
        map.set(r.id, r);
        sel.set(r.id, r.autoSelect ?? "");
      }
      setLines(parsed);
      setResults(map);
      setSelection(sel);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Matching failed");
    } finally {
      setMatching(false);
    }
  }

  async function applyMatches() {
    const matches = lines
      .filter((l) => selection.get(l.id))
      .map((l) => ({
        invoiceId: selection.get(l.id)!,
        amount: l.amount,
        date: l.date ?? new Date().toISOString().slice(0, 10),
        reference: l.reference,
        method: l.reference && /^[A-Z0-9]{9,12}$/.test(l.reference) ? "MPESA" : "BANK_TRANSFER",
      }));
    if (matches.length === 0) { toast.error("Nothing selected to apply"); return; }
    setApplying(true);
    try {
      const res = await fetch("/api/invoices/reconcile/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to apply");
      const paid = (json.applied ?? []).filter((a: { nowPaid: boolean }) => a.nowPaid).length;
      setDone({ applied: (json.applied ?? []).length, paid, failed: (json.failed ?? []).length });
      if ((json.failed ?? []).length > 0) {
        toast.error(`${json.failed.length} line(s) failed — see invoices for details`);
      } else {
        toast.success(`${json.applied.length} payment(s) recorded — ${paid} invoice(s) now paid`);
      }
      // Drop applied lines from view; keep unmatched for another pass.
      const appliedIds = new Set(matches.map((m) => m.invoiceId));
      setLines((prev) => prev.filter((l) => !appliedIds.has(selection.get(l.id) || "")));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  const selectedCount = lines.filter((l) => selection.get(l.id)).length;

  return (
    <>
      <Header title="Reconcile Statement" />
      <div className="page-container">
        <button
          onClick={() => router.push("/invoices")}
          className="flex items-center gap-1 text-body text-gray-400 hover:text-gold mb-3"
        >
          <ChevronLeft size={14} /> Back to invoices
        </button>
        <h1 className="text-h1 text-header mb-1">Reconcile a bank / M-Pesa statement</h1>
        <p className="text-body text-gray-500 mb-5 max-w-2xl">
          Paste your statement (or upload a CSV export). Credit lines are matched against open
          invoices by amount and payer name — you confirm each match before anything is recorded.
        </p>

        <Card className="mb-5">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={7}
            placeholder={"Paste statement lines here…\ne.g.  TFA1BC2DEF Confirmed. Ksh85,000.00 received from JOHN KAMAU 254712345678 on 1/8/26\nor a CSV export with Date, Details, Reference, Amount columns"}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-body font-mono focus:outline-none focus:border-gold"
          />
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 text-body text-gray-500 cursor-pointer hover:text-gold">
              <Upload size={14} /> Upload CSV
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
            <Button onClick={runMatch} loading={matching} variant="primary">
              <Wand2 size={15} /> Match against open invoices
            </Button>
          </div>
        </Card>

        {done && (
          <Card className="mb-5 border border-green-100 bg-green-50/40">
            <div className="flex items-center gap-2 text-body text-green-800">
              <CheckCircle2 size={16} />
              {done.applied} payment{done.applied === 1 ? "" : "s"} recorded · {done.paid} invoice{done.paid === 1 ? "" : "s"} now fully paid
              {done.failed > 0 && <span className="text-expense"> · {done.failed} failed</span>}
            </div>
          </Card>
        )}

        {lines.length > 0 && (
          <Card padding="none">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
              <p className="text-body text-gray-600">
                {lines.length} credit line{lines.length === 1 ? "" : "s"} · {selectedCount} matched
              </p>
              <Button onClick={applyMatches} loading={applying} disabled={selectedCount === 0} variant="primary" size="sm">
                Record {selectedCount} payment{selectedCount === 1 ? "" : "s"}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-body">
                <thead className="bg-cream-dark">
                  <tr>
                    {["Date", "Amount", "Statement line", "Match to invoice"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-label font-medium text-gray-400 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const r = results.get(l.id);
                    const sel = selection.get(l.id) ?? "";
                    const chosen = r?.candidates.find((c) => c.invoiceId === sel);
                    return (
                      <tr key={l.id} className="border-t border-gray-50 align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">{l.date ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums font-medium text-header whitespace-nowrap">
                          {chosen ? formatCurrency(l.amount, chosen.currency) : l.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <p className="line-clamp-2">{l.description ?? "—"}</p>
                          {l.reference && <p className="text-caption text-gray-400 font-mono">{l.reference}</p>}
                        </td>
                        <td className="px-4 py-3 min-w-[280px]">
                          {r && r.candidates.length > 0 ? (
                            <>
                              <select
                                value={sel}
                                onChange={(e) => setSelection((prev) => new Map(prev).set(l.id, e.target.value))}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-body bg-white focus:outline-none focus:border-gold"
                              >
                                <option value="">— Skip this line —</option>
                                {r.candidates.map((c) => (
                                  <option key={c.invoiceId} value={c.invoiceId}>
                                    {c.tenantName} · {c.invoiceNumber} · {formatCurrency(c.outstanding, c.currency)} due
                                  </option>
                                ))}
                              </select>
                              {chosen && !chosen.exactAmount && (
                                <p className="mt-1 flex items-center gap-1 text-caption text-amber-600">
                                  <AlertTriangle size={11} /> Partial payment — {formatCurrency(chosen.outstanding - l.amount, chosen.currency)} will remain outstanding
                                </p>
                              )}
                              {r.autoSelect === sel && sel !== "" && (
                                <p className="mt-1 text-caption text-income">Auto-matched</p>
                              )}
                            </>
                          ) : (
                            <span className="text-caption text-gray-400">No open invoice matches this amount</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
