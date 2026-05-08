"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { Mail, Reply, Forward, RefreshCw, AlertTriangle } from "lucide-react";

type Kind =
  | "PASSWORD_RESET"
  | "ORG_INVITATION"
  | "CONTACT_FORM"
  | "CONTACT_AUTOREPLY"
  | "NEW_USER_ALERT"
  | "WELCOME"
  | "NOTIFICATION"
  | "MANUAL";

interface ListItem {
  id: string;
  kind: Kind;
  fromEmail: string;
  toEmail: string;
  replyTo: string | null;
  subject: string;
  status: string;
  resendId: string | null;
  sentAt: string;
  inReplyToId: string | null;
}

interface FullEmail extends ListItem {
  bodyHtml: string;
  bodyText: string | null;
  errorMessage: string | null;
  organizationId: string | null;
  userId: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
  organization: { id: string; name: string } | null;
  inReplyTo: { id: string; subject: string; toEmail: string; fromEmail: string; sentAt: string } | null;
  replies: Array<{ id: string; subject: string; toEmail: string; fromEmail: string; sentAt: string; status: string; kind: Kind }>;
}

const KINDS: Kind[] = [
  "PASSWORD_RESET",
  "ORG_INVITATION",
  "CONTACT_FORM",
  "CONTACT_AUTOREPLY",
  "NEW_USER_ALERT",
  "WELCOME",
  "NOTIFICATION",
  "MANUAL",
];

const kindBadge: Record<Kind, "green" | "blue" | "amber" | "gold" | "gray" | "red"> = {
  PASSWORD_RESET: "amber",
  ORG_INVITATION: "blue",
  CONTACT_FORM: "gold",
  CONTACT_AUTOREPLY: "gray",
  NEW_USER_ALERT: "green",
  WELCOME: "green",
  NOTIFICATION: "blue",
  MANUAL: "gold",
};

export default function AdminEmailsPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user.role === "ADMIN" && session?.user.organizationId === null;

  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<Kind | "">("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FullEmail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitial, setComposerInitial] = useState<{
    to?: string; subject?: string; body?: string; replyTo?: string; inReplyToId?: string | null;
  }>({});

  async function loadList() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (kindFilter) params.set("kind", kindFilter);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/admin/emails?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setItems(json.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSuperAdmin) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, kindFilter, statusFilter]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setSelectedId(id);
    try {
      const res = await fetch(`/api/admin/emails/${id}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function openCompose() {
    setComposerInitial({});
    setComposerOpen(true);
  }

  function openReply() {
    if (!detail) return;
    const replyAddr = detail.replyTo || detail.fromEmail;
    // For emails we sent (toEmail = recipient), reply usually means contacting that recipient.
    // For inbound-style records (CONTACT_FORM has replyTo set to visitor), reply to replyTo.
    const target = detail.kind === "CONTACT_FORM" && detail.replyTo ? detail.replyTo : detail.toEmail;
    setComposerInitial({
      to: target,
      subject: detail.subject.startsWith("Re:") ? detail.subject : `Re: ${detail.subject}`,
      body: `\n\n— On ${new Date(detail.sentAt).toLocaleString()}, ${detail.fromEmail} wrote (to ${detail.toEmail}):\n\n${stripHtml(detail.bodyHtml)}`,
      replyTo: replyAddr,
      inReplyToId: detail.id,
    });
    setComposerOpen(true);
  }

  function openForward() {
    if (!detail) return;
    setComposerInitial({
      to: "",
      subject: detail.subject.startsWith("Fwd:") ? detail.subject : `Fwd: ${detail.subject}`,
      body: `\n\n— Forwarded message —\nFrom: ${detail.fromEmail}\nTo: ${detail.toEmail}\nDate: ${new Date(detail.sentAt).toLocaleString()}\nSubject: ${detail.subject}\n\n${stripHtml(detail.bodyHtml)}`,
      inReplyToId: detail.id,
    });
    setComposerOpen(true);
  }

  if (!session) {
    return <div className="p-6"><Spinner /></div>;
  }

  if (!isSuperAdmin) {
    return (
      <>
        <Header title="Emails" userName={session.user.name} role={session.user.role} />
        <div className="page-container">
          <Card>
            <div className="flex items-center gap-3 text-gray-600">
              <AlertTriangle size={18} className="text-amber-500" />
              This page is restricted to the platform super-admin.
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Emails" userName={session.user.name} role={session.user.role} />
      <div className="page-container">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* List */}
          <div className="flex-1 min-w-0 lg:max-w-[480px]">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base text-header flex items-center gap-2">
                  <Mail size={16} /> Outbound emails
                </h2>
                <Button size="sm" onClick={openCompose}>New email</Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Input
                  placeholder="Search subject, to, from…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") loadList(); }}
                />
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter((e.target.value || "") as Kind | "")}
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-cream/50"
                >
                  <option value="">All kinds</option>
                  {KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-cream/50"
                >
                  <option value="">All status</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </select>
                <Button variant="secondary" size="sm" onClick={loadList} aria-label="Refresh">
                  <RefreshCw size={14} />
                </Button>
              </div>
              {loading ? (
                <div className="py-12 flex justify-center"><Spinner /></div>
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No emails yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {items.map((it) => {
                    const active = selectedId === it.id;
                    return (
                      <li key={it.id}>
                        <button
                          onClick={() => loadDetail(it.id)}
                          className={`w-full text-left px-3 py-2.5 hover:bg-cream-dark/50 transition-colors rounded-lg ${active ? "bg-cream-dark" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Badge variant={kindBadge[it.kind]}>{it.kind.replace(/_/g, " ")}</Badge>
                            <span className="text-xs text-gray-400 shrink-0">
                              {new Date(it.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-header truncate">{it.subject}</div>
                          <div className="text-xs text-gray-500 truncate">→ {it.toEmail}</div>
                          {it.status === "failed" && (
                            <div className="text-xs text-expense mt-1">⚠ Failed</div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* Detail */}
          <div className="flex-1 min-w-0">
            <Card>
              {detailLoading ? (
                <div className="py-12 flex justify-center"><Spinner /></div>
              ) : !detail ? (
                <p className="text-sm text-gray-500 py-12 text-center">Select an email to view.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg text-header break-words">{detail.subject}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        From <span className="text-header">{detail.fromEmail}</span>
                        {" → "}
                        <span className="text-header">{detail.toEmail}</span>
                      </p>
                      {detail.replyTo && (
                        <p className="text-xs text-gray-500">Reply-To: {detail.replyTo}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(detail.sentAt).toLocaleString()} · {detail.status}
                        {detail.resendId && ` · resend ${detail.resendId.slice(0, 8)}`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={openReply}>
                        <Reply size={14} /> Reply
                      </Button>
                      <Button size="sm" variant="secondary" onClick={openForward}>
                        <Forward size={14} /> Forward
                      </Button>
                    </div>
                  </div>

                  {detail.errorMessage && (
                    <div className="text-sm text-expense bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <strong>Send failed:</strong> {detail.errorMessage}
                    </div>
                  )}

                  {detail.inReplyTo && (
                    <p className="text-xs text-gray-500">
                      In reply to: <span className="text-header">{detail.inReplyTo.subject}</span>
                    </p>
                  )}

                  <iframe
                    srcDoc={detail.bodyHtml}
                    sandbox=""
                    className="w-full min-h-[420px] border border-gray-100 rounded-lg bg-white"
                    title="Email body"
                  />

                  {detail.replies.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-header mb-2">Replies ({detail.replies.length})</h4>
                      <ul className="divide-y divide-gray-100">
                        {detail.replies.map((r) => (
                          <li key={r.id}>
                            <button
                              onClick={() => loadDetail(r.id)}
                              className="w-full text-left px-3 py-2 hover:bg-cream-dark/50 rounded-lg"
                            >
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>→ {r.toEmail}</span>
                                <span>{new Date(r.sentAt).toLocaleString()}</span>
                              </div>
                              <div className="text-sm text-header truncate">{r.subject}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <EmailComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSent={() => { loadList(); if (selectedId) loadDetail(selectedId); }}
        initial={composerInitial}
      />
    </>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
