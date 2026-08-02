"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import { exportVendorStatement } from "@/lib/excel-export";
import { Download } from "lucide-react";
import toast from "react-hot-toast";

interface StatementLine {
  date: string;
  type: "INVOICE" | "PAYMENT";
  refId: string;
  description: string;
  propertyName: string | null;
  reference: string | null;
  vatAmount: number | null;
  invoiced: number;
  paid: number;
  balance: number;
}

interface Statement {
  vendor: { id: string; name: string };
  openingBalance: number;
  lines: StatementLine[];
  totals: { invoiced: number; paid: number; outstanding: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  vendor: { id: string; name: string } | null;
}

const fmtD = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

export function VendorStatementModal({ open, onClose, vendor }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);

  const load = useCallback(async (vendorId: string, fromV: string, toV: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fromV) qs.set("from", fromV);
      if (toV)   qs.set("to", toV);
      const res = await fetch(`/api/vendors/${vendorId}/statement${qs.size ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error();
      setStatement(await res.json());
    } catch {
      toast.error("Failed to load statement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !vendor) return;
    setFrom(""); setTo("");
    load(vendor.id, "", "");
  }, [open, vendor, load]);

  function handleExport() {
    if (!statement) return;
    const rangeLabel = from || to ? `${from || "start"}_${to || "today"}` : "all-time";
    exportVendorStatement(statement, rangeLabel);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Statement — ${vendor?.name ?? ""}`} size="lg">
      <div className="space-y-4">
        {/* Range + export */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-40">
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => vendor && load(vendor.id, from, to)}
            disabled={loading}
          >
            Apply
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={!statement || loading}>
            <Download size={13} className="mr-1.5" /> Export Excel
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : statement ? (
          <>
            {/* Totals strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Invoiced",    value: statement.totals.invoiced,    cls: "text-gray-900" },
                { label: "Paid",        value: statement.totals.paid,        cls: "text-income" },
                { label: "Balance owed", value: statement.totals.outstanding, cls: statement.totals.outstanding > 0 ? "text-expense" : "text-gray-900" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-caption text-gray-500">{label}</div>
                  <div className={`text-h3 font-semibold tabular-nums ${cls}`}>{formatCurrency(value)}</div>
                </div>
              ))}
            </div>

            {statement.lines.length === 0 ? (
              <div className="text-caption text-gray-400 bg-gray-50 rounded-lg p-4 text-center">
                No activity in this period.
              </div>
            ) : (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-caption">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Description</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium">Invoiced</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium">Paid</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <tr className="bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-500" colSpan={4}>Opening balance</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {formatCurrency(statement.openingBalance)}
                        </td>
                      </tr>
                      {statement.lines.map((l) => (
                        <tr key={`${l.type}-${l.refId}`}>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtD(l.date)}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {l.description}
                            {l.propertyName && <span className="text-gray-400"> · {l.propertyName}</span>}
                            {l.reference && <span className="text-gray-400 font-mono"> · {l.reference}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.type === "INVOICE" ? formatCurrency(l.invoiced) : ""}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-income">
                            {l.type === "PAYMENT" ? formatCurrency(l.paid) : ""}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatCurrency(l.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
