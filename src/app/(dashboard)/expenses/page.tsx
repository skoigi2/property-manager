"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { expenseEntrySchema, type ExpenseEntryInput } from "@/lib/validations";
import { formatDate } from "@/lib/date-utils";
import { Trash2, Plus, Receipt, Wallet } from "lucide-react";

const CATEGORIES = [
  "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
  "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
];

const CAT_LABELS: Record<string, string> = {
  SERVICE_CHARGE: "Service Charge",
  MANAGEMENT_FEE: "Management Fee",
  WIFI: "Wi-Fi",
  WATER: "Water",
  ELECTRICITY: "Electricity",
  CLEANER: "Cleaner",
  CONSUMABLES: "Consumables",
  MAINTENANCE: "Maintenance",
  REINSTATEMENT: "Reinstatement",
  CAPITAL: "Capital Item",
  OTHER: "Other",
};

export default function ExpensesPage() {
  const { data: session } = useSession();
  const [properties, setProperties] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [showForm, setShowForm] = useState(false);
  const [pettyCashBalance, setPettyCashBalance] = useState<number | null>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<ExpenseEntryInput>({
    resolver: zodResolver(expenseEntrySchema),
    defaultValues: { scope: "UNIT", isSunkCost: false, paidFromPettyCash: false },
  });

  const scope = watch("scope");
  const paidFromPettyCash = watch("paidFromPettyCash");
  const allUnits = properties.flatMap((p: any) => (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name })));

  // Fetch petty cash balance when form is shown
  useEffect(() => {
    if (!showForm) return;
    fetch("/api/petty-cash")
      .then((r) => r.json())
      .then((entries: any[]) => {
        // entries are sorted newest first; balance is on the first entry
        const balance = entries.length > 0 ? entries[0].balance : 0;
        setPettyCashBalance(balance);
      })
      .catch(() => setPettyCashBalance(null));
  }, [showForm]);

  useEffect(() => { fetch("/api/properties").then((r) => r.json()).then(setProperties); }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/expenses?year=${month.getFullYear()}&month=${month.getMonth() + 1}`)
      .then((r) => r.json())
      .then((d) => { setEntries(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month]);

  async function onSubmit(data: ExpenseEntryInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      reset({ scope: "UNIT", isSunkCost: false, paidFromPettyCash: false });
      setShowForm(false);
      toast.success(data.paidFromPettyCash ? "Expense saved & petty cash debited" : "Expense added");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/expenses/${deleteId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== deleteId));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  const totalOp = entries.filter((e: any) => !e.isSunkCost).reduce((s: number, e: any) => s + e.amount, 0);
  const totalSunk = entries.filter((e: any) => e.isSunkCost).reduce((s: number, e: any) => s + e.amount, 0);

  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  return (
    <div>
      <Header title="Expenses" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        {/* Month selector */}
        <div className="flex items-center gap-3">
          <MonthPicker value={month} onChange={setMonth} max={new Date()} />
          {!isCurrentMonth && (
            <button
              onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="text-xs text-gold hover:text-gold-dark font-sans font-medium underline underline-offset-2 transition-colors"
            >
              Back to current month
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Operating Expenses", value: -totalOp, color: "text-expense" },
            { label: "Capital / Sunk Costs", value: -totalSunk, color: "text-gray-500" },
            { label: "Total", value: -(totalOp + totalSunk), color: "text-expense" },
          ].map((s) => (
            <Card key={s.label} padding="sm">
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{s.label}</p>
              <CurrencyDisplay amount={s.value} className={`block mt-1 ${s.color}`} size="lg" />
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="section-header">Entries</h2>
          <Button onClick={() => setShowForm(!showForm)} size="sm" variant="gold">
            <Plus size={15} /> Add Expense
          </Button>
        </div>

        {showForm && (
          <Card>
            <h3 className="font-display text-base text-header mb-4">New Expense</h3>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Date" type="date" {...register("date")} error={errors.date?.message} />
                <Select label="Scope" {...register("scope")} options={[
                  { value: "UNIT", label: "Unit" },
                  { value: "PROPERTY", label: "Whole Property" },
                  { value: "PORTFOLIO", label: "Whole Portfolio" },
                ]} />
              </div>

              {scope === "UNIT" && (
                <Select
                  label="Unit"
                  placeholder="Select unit..."
                  {...register("unitId")}
                  options={allUnits.map((u: any) => ({ value: u.id, label: `${u.unitNumber} (${u.propertyName})` }))}
                  error={errors.unitId?.message}
                />
              )}
              {scope === "PROPERTY" && (
                <Select
                  label="Property"
                  placeholder="Select property..."
                  {...register("propertyId")}
                  options={properties.map((p: any) => ({ value: p.id, label: p.name }))}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Category"
                  {...register("category")}
                  options={CATEGORIES.map((c) => ({ value: c, label: CAT_LABELS[c] }))}
                  error={errors.category?.message}
                />
                <Input label="Amount (KSh)" type="number" step="0.01" prefix="KSh" {...register("amount")} error={errors.amount?.message} />
              </div>

              <Input label="Description" {...register("description")} placeholder="Optional description..." />

              {/* Sunk cost */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" {...register("isSunkCost")} className="w-4 h-4 rounded border-gray-300 accent-gold" />
                <span className="text-sm font-sans text-gray-600">
                  Sunk cost / capital item <span className="text-gray-400">(excluded from monthly P&L)</span>
                </span>
              </label>

              {/* Paid from petty cash */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" {...register("paidFromPettyCash")} className="w-4 h-4 rounded border-gray-300 accent-gold" />
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-amber-600" />
                    <span className="text-sm font-sans text-gray-700 font-medium">Paid from petty cash</span>
                  </div>
                </label>
                {paidFromPettyCash && (
                  <div className="pl-7 text-xs font-sans">
                    {pettyCashBalance === null ? (
                      <span className="text-gray-400">Loading balance…</span>
                    ) : (
                      <span className={pettyCashBalance >= 0 ? "text-income" : "text-expense"}>
                        Current petty cash balance: KSh {pettyCashBalance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        {pettyCashBalance < 0 && " ⚠ Deficit — consider topping up"}
                      </span>
                    )}
                    <p className="text-gray-400 mt-0.5">A matching Petty Cash OUT entry will be created automatically.</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={submitting}>Save Expense</Button>
                <Button type="button" variant="secondary" onClick={() => { reset({ scope: "UNIT", isSunkCost: false, paidFromPettyCash: false }); setShowForm(false); }}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        <Card padding="none">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : entries.length === 0 ? (
            <EmptyState
              title="No expenses"
              description="No expenses logged for this month"
              icon={<Receipt size={40} />}
              action={<Button variant="gold" size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> Add Expense</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="bg-cream-dark">
                  <tr>
                    {["Date", "Unit/Scope", "Category", "Amount", "Note", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => (
                    <tr key={e.id} className="border-t border-gray-50 hover:bg-cream/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-sans text-gray-600">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-500">{e.unit?.unitNumber ?? e.property?.name ?? e.scope}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={e.isSunkCost ? "gray" : "blue"}>{CAT_LABELS[e.category]}</Badge>
                          {e.paidFromPettyCash && (
                            <span title="Paid from petty cash">
                              <Wallet size={12} className="text-amber-500" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CurrencyDisplay amount={e.amount} size="sm" className={e.isSunkCost ? "text-gray-400 line-through" : "text-expense"} />
                      </td>
                      <td className="px-4 py-3 text-sm font-sans text-gray-400 max-w-xs truncate">{e.description ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete expense?"
        message="This expense entry will be permanently deleted. Note: any petty cash OUT entry created with it will NOT be automatically reversed."
        loading={deleting}
      />
    </div>
  );
}
