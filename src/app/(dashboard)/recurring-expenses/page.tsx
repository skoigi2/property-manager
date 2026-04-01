"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { formatDate } from "@/lib/date-utils";
import { RepeatIcon, Plus, Trash2, Play, ToggleLeft, ToggleRight, CalendarClock } from "lucide-react";

const CATEGORIES = [
  "SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY",
  "CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER",
];
const CAT_LABELS: Record<string,string> = {
  SERVICE_CHARGE:"Service Charge", MANAGEMENT_FEE:"Management Fee", WIFI:"Wi-Fi",
  WATER:"Water", ELECTRICITY:"Electricity", CLEANER:"Cleaner", CONSUMABLES:"Consumables",
  MAINTENANCE:"Maintenance", REINSTATEMENT:"Reinstatement", CAPITAL:"Capital Item", OTHER:"Other",
};
const FREQ_LABELS: Record<string,string> = { MONTHLY:"Monthly", QUARTERLY:"Quarterly", ANNUAL:"Annual" };
const FREQ_BADGE: Record<string, "green"|"blue"|"amber"> = { MONTHLY:"green", QUARTERLY:"blue", ANNUAL:"amber" };

const schema = z.object({
  description: z.string().min(1, "Description required"),
  category: z.enum(["SERVICE_CHARGE","MANAGEMENT_FEE","WIFI","WATER","ELECTRICITY","CLEANER","CONSUMABLES","MAINTENANCE","REINSTATEMENT","CAPITAL","OTHER"]),
  amount: z.coerce.number().positive("Must be positive"),
  scope: z.enum(["UNIT","PROPERTY","PORTFOLIO"]),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  frequency: z.enum(["MONTHLY","QUARTERLY","ANNUAL"]),
  nextDueDate: z.string().min(1, "Next due date required"),
});
type FormValues = z.infer<typeof schema>;

interface RecurringItem {
  id: string;
  description: string;
  category: string;
  amount: number;
  scope: string;
  frequency: string;
  nextDueDate: string;
  isActive: boolean;
  property: { name: string } | null;
  unit: { unitNumber: string } | null;
}

const now = new Date();

export default function RecurringExpensesPage() {
  const { data: session } = useSession();
  const { selectedId, selected } = useProperty();
  const currency = selected?.currency ?? "KES";
  const [items, setItems]           = useState<RecurringItem[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId]     = useState<string|null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [applying, setApplying]     = useState(false);
  const [applyMonth, setApplyMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { scope: "PROPERTY", frequency: "MONTHLY" },
  });

  const scope = watch("scope");
  const allUnits = properties.flatMap((p:any) => (p.units ?? []).map((u:any) => ({ ...u, propertyName: p.name })));

  const load = useCallback(() => {
    setLoading(true);
    const propParam = selectedId ? `?propertyId=${selectedId}` : "";
    Promise.all([fetch(`/api/recurring-expenses${propParam}`).then(r=>r.json()), fetch("/api/properties").then(r=>r.json())])
      .then(([rec, props]) => { setItems(rec); setProperties(props); })
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    const payload = {
      ...data,
      propertyId: scope === "PROPERTY" ? data.propertyId : null,
      unitId: scope === "UNIT" ? data.unitId : null,
    };
    const res = await fetch("/api/recurring-expenses", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    setSubmitting(false);
    if (!res.ok) { toast.error("Failed to add recurring expense"); return; }
    toast.success("Recurring expense added");
    reset();
    setShowForm(false);
    load();
  };

  const toggleActive = async (item: RecurringItem) => {
    const res = await fetch(`/api/recurring-expenses/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (!res.ok) { toast.error("Failed to update"); return; }
    toast.success(item.isActive ? "Paused" : "Activated");
    load();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const res = await fetch(`/api/recurring-expenses/${deleteId}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteId(null);
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success("Deleted");
    load();
  };

  const applyNow = async () => {
    const [y, m] = applyMonth.split("-").map(Number);
    setApplying(true);
    const res = await fetch("/api/recurring-expenses/apply", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ year: y, month: m }),
    });
    setApplying(false);
    if (!res.ok) { toast.error("Apply failed"); return; }
    const result = await res.json();
    toast.success(`Applied ${result.applied} recurring expense${result.applied !== 1 ? "s" : ""} as expense entries`);
    load();
  };

  const due = items.filter(i => i.isActive && new Date(i.nextDueDate) <= new Date());
  const isManager = session?.user?.role === "MANAGER";

  return (
    <div>
      <Header title="Recurring Expenses" />
      <div className="page-container space-y-5">

        {/* Apply panel */}
        {isManager && (
          <Card padding="md" className="border border-amber-100 bg-amber-50/50">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-sm font-medium text-header mb-1">Apply Due Expenses</p>
                <p className="text-xs text-gray-500 mb-3">
                  Creates expense entries for all active recurring items whose due date falls on or before the selected month.
                  {due.length > 0 && <span className="ml-1 font-medium text-amber-700">{due.length} item{due.length!==1?"s":""} currently due.</span>}
                </p>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Month</label>
                    <input
                      type="month"
                      value={applyMonth}
                      onChange={e => setApplyMonth(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
                    />
                  </div>
                  <Button variant="gold" onClick={applyNow} loading={applying} className="flex items-center gap-2">
                    <Play size={14} />
                    Apply to Expenses
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-sans">{items.length} template{items.length!==1?"s":""} · {due.length} due</p>
          </div>
          {isManager && (
            <Button variant="gold" onClick={() => setShowForm(true)} className="flex items-center gap-2">
              <Plus size={16} />
              Add Recurring
            </Button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<RepeatIcon size={32} className="text-gray-300" />} title="No recurring expenses" description="Add templates for standing costs that repeat each month, quarter, or year." />
        ) : (
          <div className="grid gap-3">
            {items.map(item => {
              const isDue = item.isActive && new Date(item.nextDueDate) <= new Date();
              return (
                <Card key={item.id} padding="md" className={`flex items-center gap-4 ${!item.isActive ? "opacity-50" : ""}`}>
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <CalendarClock size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-header">{item.description}</p>
                      <Badge variant={FREQ_BADGE[item.frequency]}>{FREQ_LABELS[item.frequency]}</Badge>
                      {!item.isActive && <Badge variant="gray">Paused</Badge>}
                      {isDue && <Badge variant="red">Due</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 font-sans mt-0.5">
                      {CAT_LABELS[item.category]} ·{" "}
                      {item.scope === "UNIT" && item.unit ? `Unit ${item.unit.unitNumber}` : item.scope === "PROPERTY" && item.property ? item.property.name : "Portfolio"} ·{" "}
                      Next due: <span className={isDue ? "text-red-500 font-medium" : ""}>{formatDate(new Date(item.nextDueDate))}</span>
                    </p>
                  </div>
                  <CurrencyDisplay currency={currency} amount={item.amount} size="md" className="font-medium text-expense shrink-0" />
                  {isManager && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleActive(item)} className="p-2 hover:bg-gray-50 rounded-lg transition-colors" title={item.isActive ? "Pause" : "Activate"}>
                        {item.isActive
                          ? <ToggleRight size={18} className="text-income" />
                          : <ToggleLeft size={18} className="text-gray-400" />}
                      </button>
                      <button onClick={() => setDeleteId(item.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-expense">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="Add Recurring Expense" size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Description" {...register("description")} error={errors.description?.message} placeholder="e.g. Monthly internet bill" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" {...register("category")} error={errors.category?.message}
              options={CATEGORIES.map(c => ({ value: c, label: CAT_LABELS[c] }))} />
            <Input label="Amount (KSh)" type="number" {...register("amount")} error={errors.amount?.message} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Frequency" {...register("frequency")} error={errors.frequency?.message}
              options={[{value:"MONTHLY",label:"Monthly"},{value:"QUARTERLY",label:"Quarterly"},{value:"ANNUAL",label:"Annual"}]} />
            <Input label="Next Due Date" type="date" {...register("nextDueDate")} error={errors.nextDueDate?.message} />
          </div>
          <Select label="Scope" {...register("scope")} error={errors.scope?.message}
            options={[{value:"PORTFOLIO",label:"Portfolio (all properties)"},{value:"PROPERTY",label:"Specific Property"},{value:"UNIT",label:"Specific Unit"}]} />
          {scope === "PROPERTY" && (
            <Select label="Property" {...register("propertyId")} error={errors.propertyId?.message}
              options={properties.map(p => ({ value: p.id, label: p.name }))} />
          )}
          {scope === "UNIT" && (
            <Select label="Unit" {...register("unitId")} error={errors.unitId?.message}
              options={allUnits.map((u:any) => ({ value: u.id, label: `${u.propertyName} — Unit ${u.unitNumber}` }))} />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
            <Button variant="gold" type="submit" loading={submitting}>Add Recurring</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete recurring expense?"
        message="This template will be removed. Previously applied expense entries are unaffected."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}
