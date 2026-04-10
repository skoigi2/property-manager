"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import {
  ArrowLeft, Plus, ClipboardList, Calendar, User,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, X, Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Condition = "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "CRITICAL";

interface ConditionItem {
  area:           string;
  condition:      string;
  notes?:         string;
  actionRequired: boolean;
}

interface ConditionReport {
  id:               string;
  propertyId:       string;
  reportDate:       string;
  inspector?:       string | null;
  overallCondition: Condition;
  summary?:         string | null;
  items?:           ConditionItem[] | null;
  nextReviewDate?:  string | null;
  createdAt:        string;
}

// ── Condition config ──────────────────────────────────────────────────────────

const CONDITION_CONFIG: Record<Condition, { label: string; variant: "green"|"blue"|"amber"|"red"|"gray" }> = {
  EXCELLENT: { label: "Excellent", variant: "green" },
  GOOD:      { label: "Good",      variant: "blue"  },
  FAIR:      { label: "Fair",      variant: "amber" },
  POOR:      { label: "Poor",      variant: "red"   },
  CRITICAL:  { label: "Critical",  variant: "red"   },
};

// ── Report Card ───────────────────────────────────────────────────────────────

function ReportCard({ report }: { report: ConditionReport }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = CONDITION_CONFIG[report.overallCondition] ?? { label: report.overallCondition, variant: "gray" as const };
  const items: ConditionItem[] = Array.isArray(report.items) ? report.items : [];
  const actionItems = items.filter((i) => i.actionRequired);

  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
            <ClipboardList size={16} className="text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display text-sm text-header">
                Inspection Report — {format(new Date(report.reportDate), "d MMM yyyy")}
              </p>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
              {actionItems.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={10} /> {actionItems.length} action{actionItems.length > 1 ? "s" : ""} required
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 font-sans flex-wrap">
              {report.inspector && (
                <span className="flex items-center gap-1">
                  <User size={11} /> {report.inspector}
                </span>
              )}
              {report.nextReviewDate && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> Next review: {format(new Date(report.nextReviewDate), "d MMM yyyy")}
                </span>
              )}
              {items.length > 0 && (
                <span>{items.length} item{items.length > 1 ? "s" : ""} inspected</span>
              )}
            </div>
            {report.summary && (
              <p className="text-xs text-gray-500 font-sans mt-1.5 line-clamp-2">{report.summary}</p>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100 transition-colors shrink-0"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>

      {expanded && items.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-sans">
              <thead>
                <tr className="bg-cream-dark">
                  {["Area", "Condition", "Notes", "Action Req."].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className={`border-t border-gray-50 ${item.actionRequired ? "bg-red-50/30" : ""}`}>
                    <td className="px-3 py-2 font-medium text-header whitespace-nowrap">{item.area}</td>
                    <td className="px-3 py-2 text-gray-600">{item.condition}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-xs">{item.notes || "—"}</td>
                    <td className="px-3 py-2">
                      {item.actionRequired
                        ? <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={11} /> Yes</span>
                        : <span className="flex items-center gap-1 text-income"><CheckCircle2 size={11} /> No</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Add Report Modal ──────────────────────────────────────────────────────────

interface ItemRow { area: string; condition: string; notes: string; actionRequired: boolean }

function AddReportModal({
  propertyId,
  onSaved,
  onClose,
}: {
  propertyId: string;
  onSaved: (r: ConditionReport) => void;
  onClose: () => void;
}) {
  const [reportDate,       setReportDate]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [inspector,        setInspector]        = useState("");
  const [overallCondition, setOverallCondition] = useState<Condition>("GOOD");
  const [summary,          setSummary]          = useState("");
  const [nextReviewDate,   setNextReviewDate]   = useState("");
  const [items,            setItems]            = useState<ItemRow[]>([]);
  const [submitting,       setSubmitting]       = useState(false);

  function addItem() {
    setItems((p) => [...p, { area: "", condition: "", notes: "", actionRequired: false }]);
  }
  function removeItem(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, field: keyof ItemRow, value: string | boolean) {
    setItems((p) => p.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanItems = items
      .filter((r) => r.area.trim() && r.condition.trim())
      .map((r) => ({ ...r, area: r.area.trim(), condition: r.condition.trim(), notes: r.notes.trim() || undefined }));

    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/condition-reports`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate,
          inspector:        inspector.trim() || undefined,
          overallCondition,
          summary:          summary.trim() || undefined,
          nextReviewDate:   nextReviewDate || null,
          items:            cleanItems.length > 0 ? cleanItems : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      const report: ConditionReport = await res.json();
      toast.success("Condition report saved");
      onSaved(report);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="font-display text-lg text-header">New Condition Report</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Basic details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">
                Inspection Date *
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">
                Inspector
              </label>
              <input
                type="text"
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Name or company"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">
                Overall Condition *
              </label>
              <select
                value={overallCondition}
                onChange={(e) => setOverallCondition(e.target.value as Condition)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-gold/40"
              >
                {(["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"] as Condition[]).map((c) => (
                  <option key={c} value={c}>{CONDITION_CONFIG[c].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">
                Next Review Date
              </label>
              <input
                type="date"
                value={nextReviewDate}
                onChange={(e) => setNextReviewDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide font-sans mb-1.5">
              Summary
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Overall observations about the property condition..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
            />
          </div>

          {/* Inspection items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide font-sans">
                Inspection Items
              </label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-gold hover:text-gold-dark font-sans font-medium transition-colors"
              >
                <Plus size={12} /> Add item
              </button>
            </div>
            {items.length === 0 && (
              <p className="text-xs text-gray-400 font-sans italic py-2">
                No items added — click &quot;Add item&quot; to log per-area observations
              </p>
            )}
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto_auto] gap-2 items-start">
                  <input
                    type="text"
                    placeholder="Area (e.g. Roof)"
                    value={item.area}
                    onChange={(e) => updateItem(i, "area", e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <input
                    type="text"
                    placeholder="Condition"
                    value={item.condition}
                    onChange={(e) => updateItem(i, "condition", e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <input
                    type="text"
                    placeholder="Notes"
                    value={item.notes}
                    onChange={(e) => updateItem(i, "notes", e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 font-sans whitespace-nowrap pt-2.5">
                    <input
                      type="checkbox"
                      checked={item.actionRequired}
                      onChange={(e) => updateItem(i, "actionRequired", e.target.checked)}
                      className="accent-red-500"
                    />
                    Action req.
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-2 text-gray-400 hover:text-expense transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-sans text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-gold text-white rounded-xl text-sm font-sans font-medium hover:bg-gold-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                : "Save Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConditionReportsPage() {
  const { data: session } = useSession();
  const params   = useParams<{ id: string }>();
  const router   = useRouter();
  const propertyId = params.id;

  const [reports,  setReports]  = useState<ConditionReport[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [propertyName, setPropertyName] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/properties/${propertyId}/condition-reports`)
      .then((r) => r.json())
      .then((d) => { setReports(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  // Fetch property name for the header
  useEffect(() => {
    fetch(`/api/properties/${propertyId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.name) setPropertyName(d.name); })
      .catch(() => {});
  }, [propertyId]);

  function handleSaved(report: ConditionReport) {
    setReports((p) => [report, ...p]);
    setShowForm(false);
  }

  const latestCondition = reports[0]?.overallCondition as Condition | undefined;
  const conditionCfg = latestCondition ? CONDITION_CONFIG[latestCondition] : null;

  return (
    <div>
      <Header
        title="Condition Reports"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />

      <div className="page-container space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-header font-sans border border-gray-200 rounded-lg px-3 py-1.5 bg-white transition-colors"
            >
              <ArrowLeft size={13} /> Back
            </button>
            {propertyName && (
              <p className="text-sm text-gray-500 font-sans">{propertyName}</p>
            )}
          </div>
          <Button onClick={() => setShowForm(true)} size="sm" variant="primary">
            <Plus size={14} /> New Report
          </Button>
        </div>

        {/* Summary strip */}
        {reports.length > 0 && (
          <Card padding="sm">
            <div className="flex items-center gap-4 flex-wrap text-sm font-sans">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-gold" />
                <span className="text-gray-500">{reports.length} inspection report{reports.length > 1 ? "s" : ""}</span>
              </div>
              {conditionCfg && (
                <div className="flex items-center gap-1.5 text-gray-500">
                  Latest condition: <Badge variant={conditionCfg.variant}>{conditionCfg.label}</Badge>
                </div>
              )}
              {reports[0]?.nextReviewDate && (
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Calendar size={13} />
                  Next review: {format(new Date(reports[0].nextReviewDate), "d MMM yyyy")}
                </div>
              )}
              {reports.some((r) => Array.isArray(r.items) && (r.items as ConditionItem[]).some((i) => i.actionRequired)) && (
                <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={11} /> Outstanding actions
                </span>
              )}
            </div>
          </Card>
        )}

        {/* Reports list */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : reports.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <ClipboardList size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-sans text-gray-400">No inspection reports yet</p>
              <p className="text-xs font-sans text-gray-300 mt-1">Add the first condition report to track property health</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:text-gold-dark font-sans transition-colors"
              >
                <Plus size={13} /> Add report
              </button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => <ReportCard key={r.id} report={r} />)}
          </div>
        )}
      </div>

      {showForm && (
        <AddReportModal
          propertyId={propertyId}
          onSaved={handleSaved}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
