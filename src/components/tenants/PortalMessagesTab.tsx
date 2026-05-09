"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";

type ThreadSummary = {
  id: string;
  subject: string;
  category: string;
  status: "SENT" | "READ" | "RESOLVED";
  lastMessageAt: string;
  preview: string;
  lastSender: "TENANT" | "MANAGER" | null;
  unreadCount: number;
};

type ThreadDetail = {
  id: string;
  subject: string;
  category: string;
  status: "SENT" | "READ" | "RESOLVED";
  tenantName: string;
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-header">Portal Messages</h2>
        <span className="text-xs text-gray-400">Tenant ↔ Manager threads from the portal</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No portal messages yet.</p>
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
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">{t.subject}</p>
                    {t.unreadCount > 0 && (
                      <span className="shrink-0 text-xs font-bold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{t.preview}</p>
                  <div className="flex items-center justify-between text-xs">
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
              <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
                Select a thread to view the conversation.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg flex flex-col h-[600px]">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{detail.subject}</p>
                    <p className="text-xs text-gray-400">{CATEGORY_LABELS[detail.category]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detail.status !== "RESOLVED" && (
                      <button
                        onClick={() => setStatus("RESOLVED")}
                        className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                      >
                        Mark Resolved
                      </button>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[detail.status].bg} ${STATUS_STYLES[detail.status].text}`}>
                      {STATUS_STYLES[detail.status].label}
                    </span>
                  </div>
                </div>

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
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
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
                      className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleReply}
                        disabled={sending || !reply.trim()}
                        className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded disabled:opacity-50 hover:bg-gray-800"
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
