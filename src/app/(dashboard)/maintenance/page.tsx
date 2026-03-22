"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import {
  Plus, Wrench, Trash2, PencilLine, ChevronRight,
  CalendarDays, User, Receipt, CheckCircle2, ExternalLink,
  Loader2, X,
} from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status   = "OPEN" | "IN_PROGRESS" | "AWAITING_PARTS" | "DONE" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Category = "PLUMBING" | "ELECTRICAL" | "STRUCTURAL" | "APPLIANCE" | "PAINTING" | "CLEANING" | "SECURITY" | "PEST_CONTROL" | "OTHER";

interface Job {
  id:            string;
  title:         string;
  description?:  string | null;
  category:      Category;
  priority:      Priority;
  status:        Status;
  reportedBy?:   string | null;
  assignedTo?:   string | null;
  reportedDate:  string;
  scheduledDate?: string | null;
  completedDate?: string | null;
  cost?:          number | null;
  notes?:         string | null;
  expenseId?:     string | null;   // set once expense has been logged
  property:      { id: string; name: string };
  unit?:         { id: string; unitNumber: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: { status: Status; label: string; color: string; bg: string }[] = [
  { status: "OPEN",           label: "Open",           color: "text-expense",   bg: "bg-red-50"    },
  { status: "IN_PROGRESS",    label: "In Progress",    color: "text-amber-600", bg: "bg-amber-50"  },
  { status: "AWAITING_PARTS", label: "Awaiting Parts", color: "text-blue-600",  bg: "bg-blue-50"   },
  { status: "DONE",           label: "Done",           color: "text-income",    bg: "bg-green-50"  },
];

const PRIORITY_BADGE: Record<Priority, "red" | "amber" | "blue" | "gray"> = {
  URGENT: "red", HIGH: "amber", MEDIUM: "blue", LOW: "gray",
};

const CATEGORY_LABELS: Record<Category, string> = {
  PLUMBING: "Plumbing", ELECTRICAL: "Electrical", STRUCTURAL: "Structural",
  APPLIANCE: "Appliance", PAINTING: "Painting", CLEANING: "Cleaning",
  SECURITY: "Security", PEST_CONTROL: "Pest Control", OTHER: "Other",
};

// MaintenanceCategory → best matching ExpenseCategory
const CATEGORY_TO_EXPENSE: Record<Category, string> = {
  PLUMBING:    "MAINTENANCE",
  ELECTRICAL:  "MAINTENANCE",
  STRUCTURAL:  "MAINTENANCE",
  APPLIANCE:   "MAINTENANCE",
  PAINTING:    "REINSTATEMENT",
  CLEANING:    "CLEANER",
  SECURITY:    "MAINTENANCE",
  PEST_CONTROL:"MAINTENANCE",
  OTHER:       "MAINTENANCE",
};

const NEXT_STATUS: Record<Status, Status | null> = {
  OPEN: "IN_PROGRESS", IN_PROGRESS: "AWAITING_PARTS", AWAITING_PARTS: "DONE", DONE: null, CANCELLED: null,
};
const NEXT_LABEL: Record<Status, string | null> = {
  OPEN: "Start →", IN_PROGRESS: "Awaiting Parts →", AWAITING_PARTS: "Mark Done ✓", DONE: null, CANCELLED: null,
};

const EXPENSE_CATEGORIES = [
  { value: "MAINTENANCE",    label: "Maintenance"    },
  { value: "REINSTATEMENT",  label: "Reinstatement"  },
  { value: "CLEANER",        label: "Cleaner"        },
  { value: "CONSUMABLES",    label: "Consumables"    },
  { value: "ELECTRICAL",     label: "Electrical"     },
  { value: "WATER",          label: "Water"          },
  { value: "WIFI",           label: "Wi-Fi"          },
  { value: "CAPITAL",        label: "Capital"        },
  { value: "OTHER",          label: "Other"          },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const jobSchema = z.object({
  propertyId:    z.string().min(1, "Property required"),
  unitId:        z.string().optional(),
  title:         z.string().min(1, "Title required"),
  description:   z.string().optional(),
  category:      z.enum(["PLUMBING","ELECTRICAL","STRUCTURAL","APPLIANCE","PAINTING","CLEANING","SECURITY","PEST_CONTROL","OTHER"]),
  priority:      z.enum(["LOW","MEDIUM","HIGH","URGENT"]),
  assignedTo:    z.string().optional(),
  reportedBy:    z.string().optional(),
  scheduledDate: z.string().optional(),
  cost:          z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(0).optional()),
  notes:         z.string().optional(),
});
type JobForm = z.infer<typeof jobSchema>;

const logExpenseSchema = z.object({
  amount:      z.coerce.number().min(1, "Amount must be > 0"),
  description: z.string().min(1, "Required"),
  date:        z.string().min(1, "Required"),
  category:    z.string().min(1),
  isSunkCost:  z.boolean().default(false),
});
type LogExpenseForm = z.infer<typeof logExpenseSchema>;

// ─── Log Expense Modal ────────────────────────────────────────────────────────

function LogExpenseModal({ job, onClose, onLogged }: {
  job:      Job;
  onClose:  () => void;
  onLogged: (updated: Job) => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LogExpenseForm>({
    resolver: zodResolver(logExpenseSchema),
    defaultValues: {
      amount:      job.cost ?? 0,
      description: job.title,
      date:        job.completedDate
        ? format(new Date(job.completedDate), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
      category:    CATEGORY_TO_EXPENSE[job.category],
      isSunkCost:  false,
    },
  });

  async function onSubmit(data: LogExpenseForm) {
    const res = await fetch(`/api/maintenance/${job.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "log_expense", ...data }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to log expense");
      return;
    }
    const { job: updated } = await res.json();
    toast.success("Expense logged and linked to job ✓");
    onLogged(updated);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-display text-base text-header">Log as Expense</h2>
            <p className="text-xs text-gray-400 font-sans mt-0.5 truncate max-w-[280px]">{job.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Info strip */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-xs text-green-800 font-sans space-y-0.5">
            <p className="font-medium">This will create an expense entry linked to this job.</p>
            <p className="text-green-600">
              {job.property.name}{job.unit ? ` · Unit ${job.unit.unitNumber}` : ""}
              {job.completedDate ? ` · Completed ${formatDate(job.completedDate)}` : ""}
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Amount (KSh) *
            </label>
            <input
              type="number"
              min={0}
              {...register("amount", { valueAsNumber: true })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
              Description *
            </label>
            <input
              type="text"
              {...register("description")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
          </div>

          {/* Date + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Date *
              </label>
              <input
                type="date"
                {...register("date")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                Category
              </label>
              <select
                {...register("category")}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sunk cost toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register("isSunkCost")}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-sm text-gray-600 font-sans">
              Mark as sunk cost{" "}
              <span className="text-xs text-gray-400">(excluded from monthly P&L)</span>
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting
                ? <Loader2 size={14} className="animate-spin" />
                : <Receipt size={14} />
              }
              Log Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, isManager, onEdit, onDelete, onAdvance, onLogExpense, advancing }: {
  job:          Job;
  isManager:    boolean;
  onEdit:       (j: Job) => void;
  onDelete:     (j: Job) => void;
  onAdvance:    (j: Job) => void;
  onLogExpense: (j: Job) => void;
  advancing:    boolean;
}) {
  const next      = NEXT_STATUS[job.status];
  const nextLabel = NEXT_LABEL[job.status];
  const isDone    = job.status === "DONE";
  const hasCost   = job.cost != null && job.cost > 0;
  const expensed  = !!job.expenseId;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow">
      {/* Title + priority */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-header font-sans leading-snug">{job.title}</p>
        <Badge variant={PRIORITY_BADGE[job.priority]} className="shrink-0 text-xs">
          {job.priority}
        </Badge>
      </div>

      {/* Meta chips */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans flex-wrap">
        <span className="bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
          {CATEGORY_LABELS[job.category]}
        </span>
        <span>{job.property.name}</span>
        {job.unit && <span>· Unit {job.unit.unitNumber}</span>}
      </div>

      {/* Description */}
      {job.description && (
        <p className="text-xs text-gray-500 font-sans line-clamp-2">{job.description}</p>
      )}

      {/* Details */}
      <div className="space-y-1 text-xs text-gray-400 font-sans">
        {job.assignedTo && (
          <div className="flex items-center gap-1">
            <User size={10} />
            <span>{job.assignedTo}</span>
          </div>
        )}
        {job.scheduledDate && (
          <div className="flex items-center gap-1">
            <CalendarDays size={10} />
            <span>Scheduled {formatDate(job.scheduledDate)}</span>
          </div>
        )}
        {hasCost && (
          <div className="flex items-center gap-1 font-medium text-gray-500">
            <span>KSh {job.cost!.toLocaleString("en-KE")}</span>
          </div>
        )}
        {job.completedDate && (
          <div className="flex items-center gap-1 text-income">
            <CheckCircle2 size={10} />
            <span>Completed {formatDate(job.completedDate)}</span>
          </div>
        )}
      </div>

      {/* Expense status badge (Done cards only) */}
      {isDone && hasCost && (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-sans font-medium ${
          expensed
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}>
          {expensed ? (
            <>
              <CheckCircle2 size={11} />
              <span>Expense logged</span>
              <a
                href="/expenses"
                className="ml-auto flex items-center gap-0.5 text-green-600 hover:text-green-800 transition-colors"
                title="View in Expenses"
              >
                <ExternalLink size={10} />
              </a>
            </>
          ) : (
            <>
              <Receipt size={11} />
              <span>Cost not yet logged</span>
            </>
          )}
        </div>
      )}

      {/* Done with no cost — just a note */}
      {isDone && !hasCost && (
        <p className="text-xs text-gray-300 font-sans italic">No cost recorded</p>
      )}

      {/* Actions footer */}
      {isManager && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-gray-50 flex-wrap">
          {/* Advance status */}
          {next && nextLabel && (
            <button
              onClick={() => onAdvance(job)}
              disabled={advancing}
              className="flex items-center gap-1 text-xs font-medium font-sans text-gold hover:text-gold-dark transition-colors disabled:opacity-50"
            >
              {advancing
                ? <span className="w-3 h-3 rounded-full border-2 border-gold border-t-transparent animate-spin" />
                : <ChevronRight size={12} />
              }
              {nextLabel}
            </button>
          )}

          {/* Log as expense — only on Done cards with cost and no existing expense */}
          {isDone && hasCost && !expensed && (
            <button
              onClick={() => onLogExpense(job)}
              className="flex items-center gap-1 text-xs font-medium font-sans text-green-600 hover:text-green-700 transition-colors bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-lg"
            >
              <Receipt size={11} />
              Log expense
            </button>
          )}

          {/* Edit + Delete */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onEdit(job)}
              className="p-1 text-gray-300 hover:text-header transition-colors"
              title="Edit job"
            >
              <PencilLine size={13} />
            </button>
            <button
              onClick={() => onDelete(job)}
              className="p-1 text-gray-300 hover:text-expense transition-colors"
              title="Delete job"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "MANAGER";

  const [jobs, setJobs]             = useState<Job[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editJob, setEditJob]       = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [advancing, setAdvancing]   = useState<string | null>(null);
  const [filterProperty, setFilterProperty] = useState("");
  const [showDone, setShowDone]     = useState(false);
  const [logExpenseTarget, setLogExpenseTarget] = useState<Job | null>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: { category: "OTHER", priority: "MEDIUM" },
  });
  const selectedPropertyId = watch("propertyId");
  const availableUnits = properties.find((p) => p.id === selectedPropertyId)?.units ?? [];

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterProperty) params.set("propertyId", filterProperty);
    fetch(`/api/maintenance?${params}`)
      .then((r) => r.json())
      .then((d) => { setJobs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filterProperty]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/properties").then((r) => r.json()).then((d) => setProperties(Array.isArray(d) ? d : []));
  }, []);

  const openAdd = () => {
    setEditJob(null);
    reset({ category: "OTHER", priority: "MEDIUM" });
    setModalOpen(true);
  };

  const openEdit = (job: Job) => {
    setEditJob(job);
    reset({
      propertyId:    job.property.id,
      unitId:        job.unit?.id ?? "",
      title:         job.title,
      description:   job.description ?? "",
      category:      job.category,
      priority:      job.priority,
      assignedTo:    job.assignedTo ?? "",
      reportedBy:    job.reportedBy ?? "",
      scheduledDate: job.scheduledDate ? job.scheduledDate.slice(0, 10) : "",
      cost:          job.cost ?? undefined,
      notes:         job.notes ?? "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (values: JobForm) => {
    setSubmitting(true);
    try {
      const url    = editJob ? `/api/maintenance/${editJob.id}` : "/api/maintenance";
      const method = editJob ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(editJob ? "Job updated" : "Job created");
      setModalOpen(false);
      load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvance = async (job: Job) => {
    const next = NEXT_STATUS[job.status];
    if (!next) return;
    setAdvancing(job.id);
    try {
      const res = await fetch(`/api/maintenance/${job.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      const updated: Job = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
      const label = next === "DONE" ? "Marked as done ✓" : `Moved to ${next.replace("_", " ")}`;
      toast.success(label);
      // Prompt to log expense if cost was entered and job just became DONE
      if (next === "DONE" && updated.cost && updated.cost > 0 && !updated.expenseId) {
        setTimeout(() => setLogExpenseTarget(updated), 400);
      }
    } catch {
      toast.error("Failed to update status");
    } finally {
      setAdvancing(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/maintenance/${deleteTarget.id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
      toast.success("Job deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleExpenseLogged = (updated: Job) => {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  };

  const visibleColumns = showDone ? COLUMNS : COLUMNS.filter((c) => c.status !== "DONE");
  const jobsByStatus   = (status: Status) => jobs.filter((j) => j.status === status);

  const openCount   = jobs.filter((j) => j.status === "OPEN").length;
  const urgentCount = jobs.filter((j) => j.priority === "URGENT" && j.status !== "DONE" && j.status !== "CANCELLED").length;
  const doneUnlogged = jobs.filter((j) => j.status === "DONE" && j.cost && j.cost > 0 && !j.expenseId).length;

  return (
    <div>
      <Header title="Maintenance" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role}>
        {isManager && (
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} className="mr-1" /> Log Job
          </Button>
        )}
      </Header>

      <div className="page-container space-y-4 pb-24 lg:pb-8">

        {/* Summary strip */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-red-50 text-expense rounded-xl px-4 py-2 text-sm font-sans">
            <Wrench size={14} />
            <span><strong>{openCount}</strong> open job{openCount !== 1 ? "s" : ""}</span>
          </div>
          {urgentCount > 0 && (
            <div className="flex items-center gap-2 bg-red-100 text-red-700 rounded-xl px-4 py-2 text-sm font-sans font-medium">
              ⚡ {urgentCount} urgent
            </div>
          )}
          {doneUnlogged > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-700 rounded-xl px-4 py-2 text-sm font-sans">
              <Receipt size={14} />
              <span><strong>{doneUnlogged}</strong> done job{doneUnlogged !== 1 ? "s" : ""} with unlogged cost</span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="text-sm font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              onClick={() => setShowDone(!showDone)}
              className="text-xs font-sans text-gray-400 hover:text-header underline underline-offset-2 transition-colors"
            >
              {showDone ? "Hide done" : "Show done"}
            </button>
          </div>
        </div>

        {/* Workflow guide — only shown when there's content */}
        {!loading && jobs.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 text-xs text-gray-400 font-sans bg-gray-50 rounded-xl px-4 py-2">
            <span className="font-medium text-gray-500">Workflow:</span>
            {["Open", "In Progress", "Awaiting Parts", "Done"].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className={i === 0 ? "text-expense font-medium" : i === arr.length - 1 ? "text-income font-medium" : ""}>{s}</span>
                {i < arr.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
              </span>
            ))}
            <span className="ml-2 text-gray-300">·</span>
            <span className="ml-2">Mark done → <span className="text-green-600 font-medium">Log as Expense</span> to record cost in P&amp;L</span>
          </div>
        )}

        {/* Kanban board */}
        {loading ? (
          <div className="flex justify-center py-24"><Spinner size="lg" /></div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))` }}
          >
            {visibleColumns.map((col) => {
              const colJobs = jobsByStatus(col.status);
              return (
                <div key={col.status}>
                  {/* Column header */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-3 ${col.bg}`}>
                    <span className={`text-xs font-bold font-sans uppercase tracking-wide ${col.color}`}>
                      {col.label}
                    </span>
                    <span className={`text-xs font-mono font-bold ${col.color} bg-white rounded-full w-5 h-5 flex items-center justify-center`}>
                      {colJobs.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-[120px]">
                    {colJobs.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-100 rounded-xl p-4 text-center text-xs text-gray-300 font-sans">
                        No jobs
                      </div>
                    ) : (
                      colJobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          isManager={isManager}
                          onEdit={openEdit}
                          onDelete={setDeleteTarget}
                          onAdvance={handleAdvance}
                          onLogExpense={setLogExpenseTarget}
                          advancing={advancing === job.id}
                        />
                      ))
                    )}
                    {isManager && col.status === "OPEN" && (
                      <button
                        onClick={openAdd}
                        className="w-full border-2 border-dashed border-gray-200 hover:border-gold/40 rounded-xl p-3 text-xs text-gray-300 hover:text-gold font-sans transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus size={12} /> Add job
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editJob ? "Edit Job" : "Log Maintenance Job"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="form-label">Title *</label>
            <input className="form-input" {...register("title")} placeholder="e.g. Leaking tap in kitchen" />
            {errors.title && <p className="form-error">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Property *</label>
              <select className="form-input" {...register("propertyId")}>
                <option value="">Select…</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.propertyId && <p className="form-error">{errors.propertyId.message}</p>}
            </div>
            <div>
              <label className="form-label">Unit (optional)</label>
              <select className="form-input" {...register("unitId")}>
                <option value="">Whole property</option>
                {availableUnits.map((u: any) => <option key={u.id} value={u.id}>{u.unitNumber}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Category</label>
              <select className="form-input" {...register("category")}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-input" {...register("priority")}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} {...register("description")} placeholder="Details about the issue…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Assigned To</label>
              <input className="form-input" {...register("assignedTo")} placeholder="Contractor / plumber" />
            </div>
            <div>
              <label className="form-label">Reported By</label>
              <input className="form-input" {...register("reportedBy")} placeholder="Tenant / manager" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Scheduled Date</label>
              <input type="date" className="form-input" {...register("scheduledDate")} />
            </div>
            <div>
              <label className="form-label">
                {editJob?.status === "DONE" ? "Actual Cost (KSh)" : "Estimated Cost (KSh)"}
              </label>
              <input type="number" className="form-input" {...register("cost")} placeholder="0" />
            </div>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} {...register("notes")} placeholder="Any extra notes…" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>{editJob ? "Save Changes" : "Log Job"}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Log Expense Modal ────────────────────────────────────────────── */}
      {logExpenseTarget && (
        <LogExpenseModal
          job={logExpenseTarget}
          onClose={() => setLogExpenseTarget(null)}
          onLogged={handleExpenseLogged}
        />
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete job?"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
