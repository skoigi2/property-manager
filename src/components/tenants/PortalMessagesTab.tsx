"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { TutorialVideo } from "@/components/ui/TutorialVideo";
import Link from "next/link";
import { COMPLAINT_CATEGORY_LABEL, type ComplaintCategory } from "@/lib/complaint-rules";

type ThreadSummary = {
  id: string;
  subject: string;
  category: string;
  status: "SENT" | "READ" | "RESOLVED";
  lastMessageAt: string;
  preview: string;
  lastSender: "TENANT" | "MANAGER" | null;
  unreadCount: number;
  complaintId?: string | null;
};

type ThreadDetail = {
  id: string;
  subject: string;
  category: string;
  status: "SENT" | "READ" | "RESOLVED";
  tenantName: string;
  complaintId?: string | null;
  messages: { id: string; body: string; sender: "TENANT" | "MANAGER"; createdAt: string }[];
};

const CATEGORY_LABELS: Record<string, string> = {
  LEASE_QUERY: "Lease Query",
  PAYMENT_NOTIFICATION: "Payment Notification",
  PERMISSION_REQUEST: "Permission Request",
  GENERAL: "General",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SENT: { bg: "bg-amber-100", text: "text-amber-700", label: "New" },
  READ: { bg: "bg-blue-100", text: "text-blue-700", label: "Read" },
  RESOLVED: { bg: "bg-green-100", text: "text-green-700", label: "Resolved" },
};

export function PortalMessagesTab({ tenantId }: { tenantId: string }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // "Log as complaint" mini-form (one-way, once per thread)
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertCategory, setConvertCategory] = useState<ComplaintCategory>("OTHER");
  const [convertTitle, setConvertTitle] = useState("");
  const [converting, setConverting] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/messages`);
      if (res.ok) setThreads(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadDetail = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/tenants/${tenantId}/messages/${threadId}`);
    if (res.ok) setDetail(await res.json());
  }, [tenantId]);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => {
    if (activeId) loadDetail(activeId);
    else setDetail(null);
  }, [activeId, loadDetail]);

  async function handleReply() {
    if (!activeId || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/messages/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (res.ok) {
        setReply("");
        await loadDetail(activeId);
        await loadThreads();
        toast.success("Reply sent");
      } else {
        toast.error("Failed to send reply");
      }
    } finally {
      setSending(false);
    }
  }

  async function convertToComplaint() {
    if (!activeId) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/messages/${activeId}/convert-to-complaint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: convertCategory, title: convertTitle.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof body.error === "string" ? body.error : "Could not log the complaint"); return; }
      toast.success("Logged as a complaint");
      setConvertOpen(false);
      await loadDetail(activeId);
      await loadThreads();
    } finally {
      setConverting(false);
    }
  }

  async function setStatus(status: "READ" | "RESOLVED") {
    if (!activeId) return;
    const res = await fetch(`/api/tenants/${tenantId}/messages/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success(status === "RESOLVED" ? "Marked resolved" : "Status updated");
      await loadDetail(activeId);
      await loadThreads();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="section-header">Portal Messages</h2>
          <TutorialVideo tutorialKey="proof-of-payment" variant="link" />
        </div>
        <span className="text-caption text-gray-400">Tenant ↔ Manager threads from the portal</span>
      </div>

      {loading ? (
        <p className="text-body text-gray-400 text-center py-8">Loading...</p>
      ) : threads.length === 0 ? (
        <p className="text-body text-gray-400 text-center py-8">No portal messages yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Thread list */}
          <div className="md:col-span-1 space-y-2 max-h-[600px] overflow-y-auto">
            {threads.map((t) => {
              const s = STATUS_STYLES[t.status];
              const isActive = t.id === activeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isActive ? "border-gold bg-gold/5" : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-body font-semibold text-gray-900 line-clamp-1">{t.subject}</p>
                    {t.unreadCount > 0 && (
                      <span className="shrink-0 text-caption font-semibold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-gray-500 line-clamp-2 mb-1.5">{t.preview}</p>
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-gray-400">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                    <span className={`px-1.5 py-0.5 rounded font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active thread */}
          <div className="md:col-span-2">
            {!detail ? (
              <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-body">
                Select a thread to view the conversation.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg flex flex-col h-[600px]">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-body font-semibold text-gray-900">{detail.subject}</p>
                    <p className="text-caption text-gray-400">{CATEGORY_LABELS[detail.category]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detail.complaintId ? (
                      <Link href={`/complaints/${detail.complaintId}`} className="text-caption px-2 py-1 border border-gold/40 rounded text-gold hover:bg-gold/5">
                        Logged as complaint →
                      </Link>
                    ) : (
                      <button
                        onClick={() => { setConvertTitle(detail.subject); setConvertOpen((v) => !v); }}
                        className="text-caption px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                        title="Turn this conversation into a tracked complaint with a response-time SLA"
                      >
                        Log as complaint
                      </button>
                    )}
                    {detail.status !== "RESOLVED" && (
                      <button
                        onClick={() => setStatus("RESOLVED")}
                        className="text-caption px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                      >
                        Mark Resolved
                      </button>
                    )}
                    <span className={`text-caption px-2 py-0.5 rounded ${STATUS_STYLES[detail.status].bg} ${STATUS_STYLES[detail.status].text}`}>
                      {STATUS_STYLES[detail.status].label}
                    </span>
                  </div>
                </div>

                {convertOpen && !detail.complaintId && (
                  <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 space-y-2">
                    <p className="text-caption text-amber-900">
                      The tenant becomes the complainant, their messages become the complaint description, and they can follow it in their portal.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <select value={convertCategory} onChange={(e) => setConvertCategory(e.target.value as ComplaintCategory)} className="text-body border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                        {(Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[]).map((c) => <option key={c} value={c}>{COMPLAINT_CATEGORY_LABEL[c]}</option>)}
                      </select>
                      <input value={convertTitle} onChange={(e) => setConvertTitle(e.target.value)} placeholder="Complaint title" className="flex-1 min-w-40 text-body border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
                      <button onClick={convertToComplaint} disabled={converting} className="text-caption font-medium px-3 py-1.5 bg-gold text-white rounded-lg hover:bg-gold-dark disabled:opacity-50">
                        {converting ? "Logging…" : "Log complaint"}
                      </button>
                      <button onClick={() => setConvertOpen(false)} className="text-caption px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 bg-white hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.sender === "MANAGER" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 ${
                          m.sender === "MANAGER" ? "bg-gold/20 text-gray-900" : "bg-white border border-gray-200 text-gray-900"
                        }`}
                      >
                        <p className="text-body whitespace-pre-wrap">{m.body}</p>
                        <p className="text-caption text-gray-400 mt-1">
                          {m.sender === "MANAGER" ? "You" : detail.tenantName} ·{" "}
                          {format(new Date(m.createdAt), "d MMM, HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {detail.status !== "RESOLVED" && (
                  <div className="border-t border-gray-100 p-3 bg-white">
                    <textarea
                      rows={2}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type your reply..."
                      className="w-full border border-gray-200 rounded px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-gold resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleReply}
                        disabled={sending || !reply.trim()}
                        className="px-4 py-1.5 bg-gray-900 text-white text-body rounded disabled:opacity-50 hover:bg-gray-800"
                      >
                        {sending ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
