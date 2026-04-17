"use client";

import { useState, useEffect, useCallback } from "react";
import { format, isPast, parseISO } from "date-fns";
import {
  Mail, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

interface CommEntry {
  id:                string;
  type:              string;
  subject:           string;
  body:              string | null;
  templateUsed:      string | null;
  loggedByEmail:     string;
  loggedByName:      string | null;
  sentAt:            string;
  followUpDate:      string | null;
  followUpCompleted: boolean;
}

interface Props {
  tenantId: string;
}

export function CommunicationLogTab({ tenantId }: Props) {
  const [logs, setLogs]         = useState<CommEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);

  const [subject,     setSubject]     = useState("");
  const [body,        setBody]        = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/communication-log`);
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setSubject("");
    setBody("");
    setFollowUpDate("");
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/communication-log`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          type:        "EMAIL",
          subject:     subject.trim(),
          body:        body.trim() || undefined,
          followUpDate: followUpDate || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Communication logged");
      resetForm();
      await load();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function markFollowUpDone(id: string) {
    const res = await fetch(`/api/tenants/${tenantId}/communication-log/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ followUpCompleted: true }),
    });
    if (res.ok) {
      setLogs(prev => prev.map(l => l.id === id ? { ...l, followUpCompleted: true } : l));
      toast.success("Follow-up marked as done");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this communication log entry?")) return;
    const res = await fetch(`/api/tenants/${tenantId}/communication-log/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setLogs(prev => prev.filter(l => l.id !== id));
      toast.success("Entry deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function isOverdue(entry: CommEntry) {
    return (
      entry.followUpDate !== null &&
      !entry.followUpCompleted &&
      isPast(parseISO(entry.followUpDate))
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-header">Email Communications</h3>
          <p className="text-xs text-gray-500 mt-0.5">Outbound emails sent to this tenant</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5"
        >
          <Plus size={14} />
          Log Email
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Rent reminder for May 2026"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder="Summary of what was communicated..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Follow-up date (optional)
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={e => setFollowUpDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saving || !subject.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Log list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10">
          <Mail size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No communications logged yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Entries are created automatically when you send an email draft, or manually using the button above.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {logs.map(entry => {
            const overdue    = isOverdue(entry);
            const isExpanded = expanded.has(entry.id);
            return (
              <div key={entry.id} className="py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      <Mail size={10} />EMAIL
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-header truncate">{entry.subject}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {entry.body && (
                          <button
                            onClick={() => toggleExpand(entry.id)}
                            className="text-gray-400 hover:text-gray-600 p-0.5"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-gray-300 hover:text-red-500 p-0.5 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {format(parseISO(entry.sentAt), "d MMM yyyy, h:mm a")}
                      {" · "}
                      {entry.loggedByName ?? entry.loggedByEmail}
                      {entry.templateUsed && (
                        <span className="ml-1 text-gray-400">· {entry.templateUsed.replace(/_/g, " ")}</span>
                      )}
                    </p>

                    {/* Expanded body */}
                    {isExpanded && entry.body && (
                      <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">
                        {entry.body}
                      </p>
                    )}

                    {/* Follow-up indicator */}
                    {entry.followUpDate && (
                      <div className="mt-1.5 flex items-center gap-2">
                        {entry.followUpCompleted ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 size={12} />
                            Follow-up completed
                          </span>
                        ) : (
                          <>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${overdue ? "text-amber-700" : "text-gray-600"}`}>
                              {overdue && <AlertTriangle size={12} />}
                              Follow up by {format(parseISO(entry.followUpDate), "d MMM yyyy")}
                              {overdue && " (overdue)"}
                            </span>
                            <button
                              onClick={() => markFollowUpDone(entry.id)}
                              className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              Mark done
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
