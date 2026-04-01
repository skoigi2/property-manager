"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { pettyCashSchema, type PettyCashInput } from "@/lib/validations";
import { formatDate } from "@/lib/date-utils";
import {
  Trash2, Plus, Wallet, ArrowUpCircle, ArrowDownCircle,
  Pencil, X, TrendingUp, TrendingDown, Download, Search,
  ChevronsUpDown, GripVertical, ChevronUp, ChevronDown,
} from "lucide-react";
import { clsx } from "clsx";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { useProperty } from "@/lib/property-context";
import { formatCurrency } from "@/lib/currency";

export default function PettyCashPage() {
  const { data: session } = useSession();
  const { selectedId, selected, properties } = useProperty();
  const currency = selected?.currency ?? "KES";

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterProperty, setFilterProperty] = useState("");

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editValues, setEditValues] = useState<{ type: string; date: string; amount: string; description: string; propertyId: string }>({
    type: "IN", date: "", amount: "", description: "", propertyId: "",
  });

  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Column order (draggable), persisted to localStorage
  const DEFAULT_COL_ORDER = ["date", "description", "property", "in", "out", "balance"];
  const [colOrder, setColOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("petty-cash-col-order"); if (s) return JSON.parse(s); } catch {}
    return DEFAULT_COL_ORDER;
  });
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPropertyId, setBulkPropertyId] = useState<string>("");
  const [bulkType, setBulkType] = useState<string>("IN");
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PettyCashInput>({
    resolver: zodResolver(pettyCashSchema),
    defaultValues: { type: "IN" },
  });

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedId) params.set("propertyId", selectedId);
    fetch(`/api/petty-cash?${params}`)
      .then((r) => r.json())
      .then((d) => { setEntries(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => {
    setSelectedIds(new Set());
    setEditId(null);
    load();
  }, [load]);

  async function onSubmit(data: PettyCashInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, propertyId: data.propertyId || selectedId }),
      });
      if (!res.ok) throw new Error();
      load();
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
      load();
      toast.success("Deleted");
    } catch { toast.error("Failed to delete"); }
    finally { setDeleting(false); setDeleteId(null); }
  }

  function openEdit(e: any) {
    const d = new Date(e.date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setEditId(e.id);
    setEditValues({ type: e.type, date: dateStr, amount: String(e.amount), description: e.description, propertyId: e.propertyId ?? "" });
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/petty-cash/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editValues.type,
          date: editValues.date,
          amount: parseFloat(editValues.amount),
          description: editValues.description,
          propertyId: editValues.propertyId || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setEditId(null);
      load();
      toast.success("Entry updated");
    } catch { toast.error("Failed to update"); }
    finally { setEditSaving(false); }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === displayEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayEntries.map((e: any) => e.id)));
    }
  }

  async function bulkAction(action: "reassign" | "retype" | "delete") {
    if (selectedIds.size === 0) return;
    setBulkSubmitting(true);
    try {
      const body: any = { action, ids: Array.from(selectedIds) };
      if (action === "reassign") body.propertyId = bulkPropertyId || null;
      if (action === "retype")   body.type = bulkType;
      const res = await fetch("/api/petty-cash/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      load();
      toast.success(action === "delete" ? "Entries deleted" : "Entries updated");
    } catch { toast.error("Bulk action failed"); }
    finally { setBulkSubmitting(false); }
  }

  function exportCsv() {
    const rows = [["Date", "Description", "Property", "Type", "In (KSh)", "Out (KSh)", "Balance (KSh)"]];
    displayEntries.forEach((e: any) => {
      const propName = e.propertyId ? (properties.find((p) => p.id === e.propertyId)?.name ?? "") : "Portfolio";
      rows.push([
        formatDate(e.date),
        `"${e.description.replace(/"/g, '""')}"`,
        propName,
        e.type,
        e.type === "IN" ? e.amount : "",
        e.type === "OUT" ? e.amount : "",
        e.balance,
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `petty-cash-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}.csv`;
    a.click();
  }

  // Summaries (all entries loaded for this property view)
  const allIn   = entries.filter((e: any) => e.type === "IN").reduce((s: number, e: any) => s + e.amount, 0);
  const allOut  = entries.filter((e: any) => e.type === "OUT").reduce((s: number, e: any) => s + e.amount, 0);
  const balance = allIn - allOut;

  const today          = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Month-filtered entries
  const filtered = entries.filter((e: any) => {
    const d = new Date(e.date);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  });

  const periodIn  = filtered.filter((e: any) => e.type === "IN").reduce((s: number, e: any) => s + e.amount, 0);
  const periodOut = filtered.filter((e: any) => e.type === "OUT").reduce((s: number, e: any) => s + e.amount, 0);
  const periodNet = periodIn - periodOut;

  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // Further filtered + sorted for display (search + type + property filters)
  const displayEntries = useMemo(() => {
    let result = filtered
      .filter((e: any) => !filterSearch || e.description.toLowerCase().includes(filterSearch.toLowerCase()))
      .filter((e: any) => !filterType || e.type === filterType)
      .filter((e: any) => {
        if (!filterProperty) return true;
        if (filterProperty === "null") return !e.propertyId;
        return e.propertyId === filterProperty;
      });

    if (sortCol) {
      result = [...result].sort((a: any, b: any) => {
        let cmp = 0;
        if (sortCol === "date") cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        else if (sortCol === "in")  cmp = (a.type === "IN"  ? a.amount : 0) - (b.type === "IN"  ? b.amount : 0);
        else if (sortCol === "out") cmp = (a.type === "OUT" ? a.amount : 0) - (b.type === "OUT" ? b.amount : 0);
        else if (sortCol === "description") cmp = (a.description ?? "").localeCompare(b.description ?? "");
        else if (sortCol === "property") {
          const nameA = properties.find((p: any) => p.id === a.propertyId)?.name ?? "";
          const nameB = properties.find((p: any) => p.id === b.propertyId)?.name ?? "";
          cmp = nameA.localeCompare(nameB);
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [filtered, filterSearch, filterType, filterProperty, sortCol, sortDir]);

  const hasFilters = !!(filterSearch || filterType || filterProperty);
  const allDisplaySelected = displayEntries.length > 0 && selectedIds.size === displayEntries.length;

  const propertyOptions = [
    { value: "", label: "No property (portfolio)" },
    ...properties.map((p) => ({ value: p.id, label: p.name })),
  ];

  function getPropertyBadge(propertyId: string | null) {
    if (!propertyId) return <Badge variant="gray">Portfolio</Badge>;
    const prop = properties.find((p) => p.id === propertyId);
    return <Badge variant="blue">{prop?.name ?? "Unknown"}</Badge>;
  }

  const SORTABLE_COLS = new Set(["date", "description", "property", "in", "out"]);
  const COL_LABELS: Record<string, string> = {
    date: "Date", description: "Description", property: "Property",
    in: "In", out: "Out", balance: "Balance",
  };

  function renderColHeader(key: string) {
    const sortable = SORTABLE_COLS.has(key);
    const isActive = sortCol === key;
    return (
      <th
        key={key}
        onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setDragOverCol(key); }}
        onDrop={(ev) => {
          ev.preventDefault();
          const fromKey = ev.dataTransfer.getData("text/plain");
          if (!fromKey || fromKey === key) { setDragOverCol(null); return; }
          const next = [...colOrder];
          const from = next.indexOf(fromKey);
          const to = next.indexOf(key);
          if (from === -1 || to === -1) return;
          next.splice(from, 1);
          next.splice(to, 0, fromKey);
          setColOrder(next);
          localStorage.setItem("petty-cash-col-order", JSON.stringify(next));
          setDragOverCol(null);
        }}
        onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOverCol(null); }}
        className={clsx(
          "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans select-none",
          dragOverCol === key && "border-l-2 border-gold bg-gold/5"
        )}
      >
        <span className="flex items-center gap-1">
          <span
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData("text/plain", key);
              ev.dataTransfer.effectAllowed = "move";
              const th = ev.currentTarget.closest("th");
              if (th) ev.dataTransfer.setDragImage(th, th.offsetWidth / 2, th.offsetHeight / 2);
              setDragCol(key);
            }}
            onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
            className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0 pr-0.5"
          >
            <GripVertical size={11} />
          </span>
          {sortable ? (
            <button type="button" onClick={() => handleSort(key)} className="flex items-center gap-1 hover:text-header transition-colors cursor-pointer">
              {COL_LABELS[key]}
              {isActive
                ? sortDir === "asc" ? <ChevronUp size={12} className="text-gold flex-shrink-0" /> : <ChevronDown size={12} className="text-gold flex-shrink-0" />
                : <ChevronsUpDown size={12} className="text-gray-300 flex-shrink-0" />}
            </button>
          ) : (
            <span>{COL_LABELS[key]}</span>
          )}
        </span>
      </th>
    );
  }

  function renderColCell(key: string, e: any, runningBalance: number) {
    switch (key) {
      case "date":
        return <td key={key} className="px-4 py-3 text-sm font-sans text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>;
      case "description":
        return <td key={key} className="px-4 py-3 text-sm font-sans text-header">{e.description}</td>;
      case "property":
        return <td key={key} className="px-4 py-3">{getPropertyBadge(e.propertyId)}</td>;
      case "in":
        return <td key={key} className="px-4 py-3 text-right font-mono text-sm text-income">{e.type === "IN" ? formatCurrency(e.amount, currency) : "—"}</td>;
      case "out":
        return <td key={key} className="px-4 py-3 text-right font-mono text-sm text-expense">{e.type === "OUT" ? formatCurrency(e.amount, currency) : "—"}</td>;
      case "balance":
        return <td key={key} className={clsx("px-4 py-3 text-right font-mono text-sm font-medium", runningBalance >= 0 ? "text-income" : "text-expense")}>{formatCurrency(runningBalance, currency)}</td>;
      default:
        return <td key={key} />;
    }
  }

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

        {/* Filter bar */}
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search description..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm font-sans border border-gray-200 rounded-lg bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All types</option>
              <option value="IN">Cash In</option>
              <option value="OUT">Cash Out</option>
            </select>
            <select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="null">Portfolio (no property)</option>
            </select>
            {hasFilters && (
              <button
                onClick={() => { setFilterSearch(""); setFilterType(""); setFilterProperty(""); }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-sans transition-colors"
              >
                <X size={12} /> Clear filters
              </button>
            )}
            {hasFilters && (
              <span className="text-xs text-gray-400 font-sans ml-auto">
                {displayEntries.length} of {filtered.length} entries
              </span>
            )}
          </div>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card padding="sm" className="border-l-4 border-income">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle size={16} className="text-income" />
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">In This Month</p>
            </div>
            <CurrencyDisplay currency={currency} amount={periodIn} className="text-income" size="lg" />
          </Card>
          <Card padding="sm" className="border-l-4 border-expense">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle size={16} className="text-expense" />
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Out This Month</p>
            </div>
            <CurrencyDisplay currency={currency} amount={periodOut} className="text-expense" size="lg" />
          </Card>
          <Card padding="sm" className={clsx("border-l-4", periodNet >= 0 ? "border-income" : "border-expense")}>
            <div className="flex items-center gap-2 mb-1">
              {periodNet >= 0
                ? <TrendingUp size={16} className="text-income" />
                : <TrendingDown size={16} className="text-expense" />}
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Net This Month</p>
            </div>
            <CurrencyDisplay currency={currency} amount={periodNet} className={periodNet >= 0 ? "text-income" : "text-expense"} size="lg" />
          </Card>
          <Card padding="sm" className={clsx("border-l-4", balance >= 0 ? "border-gold" : "border-expense")}>
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={16} className={balance >= 0 ? "text-gold" : "text-expense"} />
              <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{balance >= 0 ? "Running Balance" : "DEFICIT"}</p>
            </div>
            <CurrencyDisplay currency={currency} amount={balance} className={balance >= 0 ? "text-gold-dark" : "text-expense"} size="lg" />
            <p className="text-xs text-gray-400 font-sans mt-0.5">all time</p>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="section-header">Ledger</h2>
          <div className="flex items-center gap-2">
            {displayEntries.length > 0 && (
              <Button onClick={exportCsv} size="sm" variant="secondary">
                <Download size={14} /> Export CSV
              </Button>
            )}
            <Button onClick={() => setShowForm(!showForm)} size="sm" variant="gold"><Plus size={15} /> Add Entry</Button>
          </div>
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
              <Select label="Property" {...register("propertyId")} options={propertyOptions} />
              <div className="flex gap-3">
                <Button type="submit" loading={submitting}>Save</Button>
                <Button type="button" variant="secondary" onClick={() => { reset({ type: "IN" }); setShowForm(false); }}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Bulk action toolbar */}
        {selectedIds.size > 0 && (
          <Card padding="sm" className="border border-gold/40 bg-cream-dark">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-sans font-medium text-header">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>

              <div className="w-px h-5 bg-gray-200" />

              <div className="flex items-center gap-2">
                <select
                  value={bulkPropertyId}
                  onChange={(e) => setBulkPropertyId(e.target.value)}
                  className="text-sm font-sans border border-gray-200 rounded-md px-2 py-1 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="">No property</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button size="sm" variant="secondary" loading={bulkSubmitting} onClick={() => bulkAction("reassign")}>Assign property</Button>
              </div>

              <div className="w-px h-5 bg-gray-200" />

              <div className="flex items-center gap-2">
                <select
                  value={bulkType}
                  onChange={(e) => setBulkType(e.target.value)}
                  className="text-sm font-sans border border-gray-200 rounded-md px-2 py-1 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  <option value="IN">Cash In</option>
                  <option value="OUT">Cash Out</option>
                </select>
                <Button size="sm" variant="secondary" loading={bulkSubmitting} onClick={() => bulkAction("retype")}>Change type</Button>
              </div>

              <div className="w-px h-5 bg-gray-200" />

              <Button size="sm" variant="secondary" className="text-expense border-expense/30 hover:bg-expense/5" loading={bulkSubmitting} onClick={() => setBulkDeleteConfirm(true)}>
                <Trash2 size={13} /> Delete selected
              </Button>
            </div>
          </Card>
        )}

        <Card padding="none">
          {loading ? <div className="flex justify-center py-12"><Spinner /></div> :
           displayEntries.length === 0 ? (
            <EmptyState
              title="No entries"
              description={entries.length === 0 ? "No petty cash entries yet" : hasFilters ? "No entries match the current filters" : "No entries for this month"}
              icon={<Wallet size={40} />}
            />
           ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead className="bg-cream-dark">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allDisplaySelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 accent-gold"
                      />
                    </th>
                    {colOrder.map((key) => renderColHeader(key))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let runningBalance = 0;
                    return displayEntries.map((e: any) => {
                      runningBalance += e.type === "IN" ? e.amount : -e.amount;
                      const rowBalance = runningBalance;
                      return (
                    <>
                      <tr key={e.id} className={clsx("border-t border-gray-50 hover:bg-cream/50 transition-colors", selectedIds.has(e.id) && "bg-gold/5")}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(e.id)}
                            onChange={() => toggleSelect(e.id)}
                            className="w-4 h-4 rounded border-gray-300 accent-gold"
                          />
                        </td>
                        {colOrder.map((key) => renderColCell(key, e, rowBalance))}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => editId === e.id ? setEditId(null) : openEdit(e)} className="text-gray-300 hover:text-gold transition-colors p-1"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteId(e.id)} className="text-gray-300 hover:text-expense transition-colors p-1"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>

                      {editId === e.id && (
                        <tr key={`edit-${e.id}`} className="border-t border-gold/20 bg-cream-dark">
                          <td colSpan={colOrder.length + 2} className="px-4 py-4">
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Type</label>
                                  <select
                                    value={editValues.type}
                                    onChange={(e) => setEditValues((v) => ({ ...v, type: e.target.value }))}
                                    className="w-full text-sm font-sans border border-gray-200 rounded-md px-3 py-2 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                                  >
                                    <option value="IN">Cash In</option>
                                    <option value="OUT">Cash Out</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Date</label>
                                  <input
                                    type="date"
                                    value={editValues.date}
                                    onChange={(ev) => setEditValues((v) => ({ ...v, date: ev.target.value }))}
                                    className="w-full text-sm font-sans border border-gray-200 rounded-md px-3 py-2 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Amount (KSh)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editValues.amount}
                                    onChange={(ev) => setEditValues((v) => ({ ...v, amount: ev.target.value }))}
                                    className="w-full text-sm font-sans border border-gray-200 rounded-md px-3 py-2 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Description</label>
                                <input
                                  type="text"
                                  value={editValues.description}
                                  onChange={(ev) => setEditValues((v) => ({ ...v, description: ev.target.value }))}
                                  className="w-full text-sm font-sans border border-gray-200 rounded-md px-3 py-2 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Property</label>
                                <select
                                  value={editValues.propertyId}
                                  onChange={(ev) => setEditValues((v) => ({ ...v, propertyId: ev.target.value }))}
                                  className="w-full text-sm font-sans border border-gray-200 rounded-md px-3 py-2 bg-white text-header focus:outline-none focus:ring-1 focus:ring-gold"
                                >
                                  <option value="">No property (portfolio)</option>
                                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" loading={editSaving} onClick={saveEdit}>Save</Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditId(null)}>Cancel</Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete entry?" message="This petty cash entry will be permanently deleted." loading={deleting} />
      <ConfirmDialog open={bulkDeleteConfirm} onClose={() => setBulkDeleteConfirm(false)} onConfirm={() => bulkAction("delete")} title={`Delete ${selectedIds.size} entries?`} message="These petty cash entries will be permanently deleted." loading={bulkSubmitting} />
    </div>
  );
}
