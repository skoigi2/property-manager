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
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { pettyCashSchema, type PettyCashInput } from "@/lib/validations";
import { formatDate } from "@/lib/date-utils";
import { Trash2, Plus, Wallet, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { clsx } from "clsx";
import { MonthPicker } from "@/components/ui/MonthPicker";

export default function PettyCashPage() {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PettyCashInput>({
    resolver: zodResolver(pettyCashSchema),
    defaultValues: { type: "IN" },
  });

  useEffect(() => {
    fetch("/api/petty-cash").then((r) => r.json()).then((d) => { setEntries(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function onSubmit(data: PettyCashInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/petty-cash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error();
      // Refetch to get updated balances
      const updated = await fetch("/api/petty-cash").then((r) => r.json());
      setEntries(updated);
      reset({ type: "IN" });
      setShowForm(false);
      toast.success("Entry added");
    } catch { toast.error("Failed to save"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/petty-cash/${deleteId}`, { method: "DELETE" });
      const updated = await fetch("/api/petty-cash").then((r) => r.json());
      setEntries(updated);
      toast.success("Deleted");
    } catch { toast.error("Failed to delete"); }
    finally { setDeleting(false); setDeleteId(null); }
  }

  // All-time totals (real running balance)
  const allIn      = entries.filter((e: any) => e.type === "IN").reduce((s: number, e: any) => s + e.amount, 0);
  const allOut     = entries.filter((e: any) => e.type === "OUT").reduce((s: number, e: any) => s + e.amount, 0);
  const balance    = allIn - allOut;

  // Month-filtered entries for display
  const today         = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const filtered      = entries.filter((e: any) => {
    const d = new Date(e.date);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  });
  const periodIn  = filtered.filter((e: any) => e.type === "IN").reduce((s: number, e: any) => s + e.amount, 0);
  const periodOut = filtered.filter((e: any) => e.type === "OUT").reduce((s: number, e: any) => s + e.amount, 0);

  return (
    <div>
      <Header title="Petty Cash" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
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

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card padding="sm" className="border-l-4 border-income">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle size={16} className="text-income" />
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">In This Month</p>
            </div>
            <CurrencyDisplay amount={periodIn} className="text-income" size="lg" />
          </Card>
          <Card padding="sm" className="border-l-4 border-expense">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle size={16} className="text-expense" />
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Out This Month</p>
            </div>
            <CurrencyDisplay amount={periodOut} className="text-expense" size="lg" />
          </Card>
          <Card padding="sm" className={clsx("border-l-4", balance >= 0 ? "border-gold" : "border-expense")}>
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={16} className={balance >= 0 ? "text-gold" : "text-expense"} />
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{balance >= 0 ? "Running Balance" : "DEFICIT"}</p>
            </div>
            <CurrencyDisplay amount={balance} className={balance >= 0 ? "text-gold-dark" : "text-expense"} size="lg" />
            <p className="text-xs text-gray-400 font-sans mt-0.5">all time</p>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="section-header">Ledger</h2>
          <Button onClick={() => setShowForm(!showForm)} size="sm" variant="gold"><Plus size={15} /> Add Entry</Button>
        </div>

        {showForm && (
          <Card>
            <h3 className="font-display text-base text-header mb-4">New Entry</h3>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Select label="Type" {...register("type")} options={[{ value: "IN", label: "Cash In" }, { value: "OUT", label: "Cash Out" }]} />
                <Input label="Date" type="date" {...register("date")} error={errors.date?.message} />
                <Input label="Amount (KSh)" type="number" step="0.01" prefix="KSh" {...register("amount")} error={errors.amount?.message} />
              </div>
              <Input label="Description" {...register("description")} error={errors.description?.message} placeholder="What is this for?" />
              <div className="flex gap-3">
                <Button type="submit" loading={submitting}>Save</Button>
                <Button type="button" variant="secondary" onClick={() => { reset({ type: "IN" }); setShowForm(false); }}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        <Card padding="none">
          {loading ? <div className="flex justify-center py-12"><Spinner /></div> :
           filtered.length === 0 ? (
            <EmptyState
              title="No entries"
              description={entries.length === 0 ? "No petty cash entries yet" : "No entries for this month"}
              icon={<Wallet size={40} />}
            />
           ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead className="bg-cream-dark">
                  <tr>{["Date", "Description", "In", "Out", "Balance", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filtered.map((e: any) => (
                    <tr key={e.id} className="border-t border-gray-50 hover:bg-cream/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-sans text-gray-600">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-sm font-sans text-header">{e.description}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-income">{e.type === "IN" ? `KSh ${e.amount.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-expense">{e.type === "OUT" ? `KSh ${e.amount.toLocaleString()}` : "—"}</td>
                      <td className={clsx("px-4 py-3 text-right font-mono text-sm font-medium", e.balance >= 0 ? "text-income" : "text-expense")}>KSh {e.balance.toLocaleString()}</td>
                      <td className="px-4 py-3"><button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete entry?" message="This petty cash entry will be permanently deleted." loading={deleting} />
    </div>
  );
}
