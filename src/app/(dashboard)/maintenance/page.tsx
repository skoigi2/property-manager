"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import {
  Plus, Wrench, Trash2, PencilLine, ChevronRight,
  CalendarDays, User, Receipt, CheckCircle2, ExternalLink,
  Loader2, X, AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { formatKSh } from "@/lib/currency";
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

interface MaintenanceSchedule {
  id: string;
  taskName: string;
  description: string | null;
  frequency: string;
  lastDone: string | null;
  nextDue: string | null;
  isActive: boolean;
  asset: {
    id: string;
    name: string;
    category: string;
    categoryOther: string | null;
    property: { id: string; name: string };
    unit: { unitNumber: string } | null;
  };
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

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly",
  BIANNUALLY: "Bi-annually", ANNUALLY: "Annually",
};

const CAT_LABELS: Record<string, string> = {
  GENERATOR: "Generator", LIFT: "Lift/Elevator", HVAC: "HVAC",
  ELECTRICAL: "Electrical", PLUMBING: "Plumbing", SECURITY: "Security",
  APPLIANCE: "Appliance", FURNITURE: "Furniture", IT_EQUIPMENT: "IT Equipment",
  VEHICLE: "Vehicle", OTHER: "Other",
};

const CAT_BADGE: Record<string, "amber" | "blue" | "gold" | "red" | "green" | "gray"> = {
  GENERATOR: "amber", LIFT: "blue", HVAC: "gold", ELECTRICAL: "amber",
  PLUMBING: "blue", SECURITY: "red", APPLIANCE: "green", FURNITURE: "gray",
  IT_EQUIPMENT: "blue", VEHICLE: "gray", OTHER: "gray",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

type TaskStatus = {
  label: string;
  variant: "red" | "amber" | "blue" | "green" | "gray";
  group: "overdue" | "week" | "month" | "upcoming" | "unscheduled";
};

function taskStatus(nextDue: string | null): TaskStatus {
  if (!nextDue) return { label: "Unscheduled", variant: "gray", group: "unscheduled" };
  const days = daysUntil(nextDue);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, variant: "red", group: "overdue" };
  if (days <= 7) return { label: `Due in ${days}d`, variant: "amber", group: "week" };
  if (days <= 30) return { label: `Due in ${days}d`, variant: "blue", group: "month" };
  return { label: `Due in ${days}d`, variant: "green", group: "upcoming" };
}

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
  const isManager = ["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session?.user?.role ?? "");

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"jobs" | "schedules">("jobs");

  // ── Jobs state ─────────────────────────────────────────────────────────────
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

  // ── Schedules state ────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [ytdCost, setYtdCost] = useState(0);
  const [filterScheduleProperty, setFilterScheduleProperty] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [logModal, setLogModal] = useState<MaintenanceSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "", cost: "", technician: "", notes: "",
  });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<JobForm>({
    resolver: zodResolver(jobSchema),
    defaultValues: { category: "OTHER", priority: "MEDIUM" },
  });
  const selectedPropertyId = watch("propertyId");
  const availableUnits = properties.find((p) => p.id === selectedPropertyId)?.units ?? [];

  // ── Jobs loader ────────────────────────────────────────────────────────────
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

  // ── Schedules loader ───────────────────────────────────────────────────────
  const loadSchedules = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterScheduleProperty) params.set("propertyId", filterScheduleProperty);
    const res = await fetch(`/api/maintenance/schedules?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSchedules(data.schedules);
      setYtdCost(data.ytdCost);
    }
  }, [filterScheduleProperty]);

  useEffect(() => {
    if (activeTab === "schedules") loadSchedules();
  }, [activeTab, loadSchedules]);

  // ── Jobs handlers ──────────────────────────────────────────────────────────
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

  // ── Schedules log handler ──────────────────────────────────────────────────
  async function handleLog() {
    if (!logModal) return;
    if (!logForm.date || !logForm.description) { toast.error("Date and description required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${logModal.asset.id}/schedules/${logModal.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: logForm.date,
          description: logForm.description,
          cost: logForm.cost ? parseFloat(logForm.cost) : null,
          technician: logForm.technician || null,
          notes: logForm.notes || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.error || "Failed"); return; }
      toast.success("Maintenance logged — next due date updated");
      setLogModal(null);
      await loadSchedules();
    } finally {
      setSaving(false);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const visibleColumns = showDone ? COLUMNS : COLUMNS.filter((c) => c.status !== "DONE");
  const jobsByStatus   = (status: Status) => jobs.filter((j) => j.status === status);

  const openCount   = jobs.filter((j) => j.status === "OPEN").length;
  const urgentCount = jobs.filter((j) => j.priority === "URGENT" && j.status !== "DONE" && j.status !== "CANCELLED").length;
  const doneUnlogged = jobs.filter((j) => j.status === "DONE" && j.cost && j.cost > 0 && !j.expenseId).length;

  const schedulesFiltered = schedules.filter((s) => {
    const st = taskStatus(s.nextDue);
    if (filterStatus && st.group !== filterStatus) return false;
    if (scheduleSearch) {
      const q = scheduleSearch.toLowerCase();
      if (!s.taskName.toLowerCase().includes(q) &&
        !s.asset.name.toLowerCase().includes(q) &&
        !s.asset.property.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const scheduleGroups: { key: string; label: string; color: string; items: MaintenanceSchedule[] }[] = [
    { key: "overdue", label: "Overdue", color: "text-expense", items: schedulesFiltered.filter(s => taskStatus(s.nextDue).group === "overdue") },
    { key: "week", label: "Due This Week", color: "text-amber-600", items: schedulesFiltered.filter(s => taskStatus(s.nextDue).group === "week") },
    { key: "month", label: "Due This Month", color: "text-blue-600", items: schedulesFiltered.filter(s => taskStatus(s.nextDue).group === "month") },
    { key: "upcoming", label: "Upcoming", color: "text-income", items: schedulesFiltered.filter(s => taskStatus(s.nextDue).group === "upcoming") },
    { key: "unscheduled", label: "Unscheduled", color: "text-gray-500", items: schedulesFiltered.filter(s => taskStatus(s.nextDue).group === "unscheduled") },
  ].filter(g => g.items.length > 0);

  const overdueCount = schedules.filter(s => taskStatus(s.nextDue).group === "overdue").length;
  const weekCount = schedules.filter(s => taskStatus(s.nextDue).group === "week").length;
  const monthCount = schedules.filter(s => taskStatus(s.nextDue).group === "month").length;

  return (
    <div>
      <Header title="Maintenance" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role}>
        {isManager && activeTab === "jobs" && (
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} className="mr-1" /> Log Job
          </Button>
        )}
      </Header>

      {/* Tab switcher */}
      <div className="border-b border-gray-200 bg-white px-6">
        <nav className="flex gap-1">
          {[
            { key: "jobs", label: "Jobs" },
            { key: "schedules", label: "Schedules" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "jobs" | "schedules")}
              className={`px-4 py-3 text-sm font-sans font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-gold text-gold"
                  : "border-transparent text-gray-500 hover:text-header hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.key === "jobs" && openCount > 0 && (
                <span className="ml-2 bg-red-100 text-expense rounded-full px-1.5 py-0.5 text-xs font-mono">
                  {openCount}
                </span>
              )}
              {tab.key === "schedules" && overdueCount > 0 && (
                <span className="ml-2 bg-red-100 text-expense rounded-full px-1.5 py-0.5 text-xs font-mono">
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="page-container space-y-4 pb-24 lg:pb-8">

        {/* ── Jobs tab ──────────────────────────────────────────────────────── */}
        {activeTab === "jobs" && (
          <>
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
          </>
        )}

        {/* ── Schedules tab ─────────────────────────────────────────────────── */}
        {activeTab === "schedules" && (
          <div className="space-y-5">

            {/* Overdue alert banner */}
            {overdueCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-3">
                <AlertTriangle size={18} className="text-expense shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-sans font-semibold text-red-800">
                    {overdueCount} maintenance {overdueCount === 1 ? "task is" : "tasks are"} overdue
                  </p>
                  <p className="text-xs font-sans text-red-600 mt-0.5">
                    {schedules
                      .filter(s => taskStatus(s.nextDue).group === "overdue")
                      .map(s => `${s.asset.name} — ${s.taskName}`)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Overdue</p>
                <p className="text-2xl font-display text-expense mt-1">{overdueCount}</p>
                <p className="text-xs font-sans text-gray-400 mt-0.5">tasks past due</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Due This Week</p>
                <p className="text-2xl font-display text-amber-600 mt-1">{weekCount}</p>
                <p className="text-xs font-sans text-gray-400 mt-0.5">within 7 days</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">Due This Month</p>
                <p className="text-2xl font-display text-blue-600 mt-1">{monthCount}</p>
                <p className="text-xs font-sans text-gray-400 mt-0.5">within 30 days</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-sans text-gray-500 uppercase tracking-wide">YTD Maintenance Cost</p>
                <p className="text-lg font-display text-header mt-1">{formatKSh(ytdCost)}</p>
                <p className="text-xs font-sans text-gray-400 mt-0.5">{new Date().getFullYear()} total</p>
              </Card>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterScheduleProperty}
                onChange={(e) => setFilterScheduleProperty(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                <option value="">All properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/30"
              >
                <option value="">All statuses</option>
                <option value="overdue">Overdue</option>
                <option value="week">Due this week</option>
                <option value="month">Due this month</option>
                <option value="upcoming">Upcoming</option>
                <option value="unscheduled">Unscheduled</option>
              </select>
              <input
                type="text"
                value={scheduleSearch}
                onChange={(e) => setScheduleSearch(e.target.value)}
                placeholder="Search asset, task, property..."
                className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>

            {/* Task list grouped by status */}
            {schedulesFiltered.length === 0 ? (
              <EmptyState
                title="No maintenance tasks"
                description="Define maintenance schedules on your assets to track upcoming work here."
              />
            ) : (
              <div className="space-y-6">
                {scheduleGroups.map(group => (
                  <div key={group.key}>
                    <h3 className={`text-sm font-sans font-semibold mb-3 flex items-center gap-2 ${group.color}`}>
                      <span className="w-2 h-2 rounded-full bg-current inline-block" />
                      {group.label}
                      <span className="font-normal text-gray-400">({group.items.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {group.items.map(s => {
                        const st = taskStatus(s.nextDue);
                        return (
                          <Card key={s.id} className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {/* Row 1: category badge + asset name + property */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant={CAT_BADGE[s.asset.category] ?? "gray"}>
                                    {CAT_LABELS[s.asset.category] ?? s.asset.category}
                                  </Badge>
                                  <span className="font-sans font-semibold text-header">{s.asset.name}</span>
                                  <span className="text-xs font-sans text-gray-400">
                                    {s.asset.property.name}
                                    {s.asset.unit && ` · Unit ${s.asset.unit.unitNumber}`}
                                  </span>
                                </div>
                                {/* Row 2: task name + frequency + status */}
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <span className="text-sm font-sans text-header font-medium">{s.taskName}</span>
                                  <Badge variant="blue">{FREQ_LABELS[s.frequency] ?? s.frequency}</Badge>
                                  <Badge variant={st.variant}>{st.label}</Badge>
                                </div>
                                {/* Row 3: last done / next due dates */}
                                <div className="flex gap-4 mt-1.5 text-xs font-sans text-gray-400">
                                  <span>
                                    Last done:{" "}
                                    {s.lastDone
                                      ? formatDate(new Date(s.lastDone))
                                      : <span className="text-gray-300">Never</span>
                                    }
                                  </span>
                                  {s.nextDue && <span>Next due: {formatDate(new Date(s.nextDue))}</span>}
                                </div>
                                {s.description && (
                                  <p className="text-xs font-sans text-gray-500 mt-1">{s.description}</p>
                                )}
                              </div>
                              {/* Log button */}
                              <Button
                                onClick={() => {
                                  setLogModal(s);
                                  setLogForm({
                                    date: new Date().toISOString().slice(0, 10),
                                    description: `${s.taskName} completed`,
                                    cost: "", technician: "", notes: "",
                                  });
                                }}
                                className="shrink-0 flex items-center gap-1.5 text-sm"
                              >
                                <CheckCircle2 size={14} /> Log
                              </Button>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      {/* ── Schedule Log Modal ───────────────────────────────────────────── */}
      <Modal
        open={!!logModal}
        onClose={() => setLogModal(null)}
        title={logModal ? `Log: ${logModal.taskName}` : "Log Maintenance"}
        size="md"
      >
        {logModal && (
          <div className="space-y-4">
            {/* Context line */}
            <div className="bg-cream rounded-lg px-3 py-2 text-xs font-sans text-gray-600 flex items-center gap-2">
              <span className="font-medium">{logModal.asset.name}</span>
              <span className="text-gray-400">·</span>
              <span>{logModal.asset.property.name}</span>
              {logModal.asset.unit && (
                <>
                  <span className="text-gray-400">·</span>
                  <span>Unit {logModal.asset.unit.unitNumber}</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                  Date <span className="text-expense">*</span>
                </label>
                <input
                  type="date"
                  value={logForm.date}
                  onChange={(e) => setLogForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
                />
              </div>
              <div>
                <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Cost (KSh)</label>
                <input
                  type="number"
                  value={logForm.cost}
                  min="0"
                  onChange={(e) => setLogForm(f => ({ ...f, cost: e.target.value }))}
                  placeholder="0"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-gold/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">
                Description <span className="text-expense">*</span>
              </label>
              <input
                type="text"
                value={logForm.description}
                onChange={(e) => setLogForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What was done?"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Technician</label>
              <input
                type="text"
                value={logForm.technician}
                onChange={(e) => setLogForm(f => ({ ...f, technician: e.target.value }))}
                placeholder="Name or company"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30"
              />
            </div>
            <div>
              <label className="block text-xs font-sans font-medium text-gray-500 mb-1">Notes</label>
              <textarea
                value={logForm.notes}
                rows={2}
                onChange={(e) => setLogForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-sans focus:outline-none focus:ring-2 focus:ring-gold/30 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setLogModal(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleLog} disabled={saving}>
                {saving ? <Spinner size="sm" /> : "Log maintenance"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
