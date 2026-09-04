"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StageTracker } from "@/components/cases/StageTracker";
import { getWorkflow } from "@/lib/case-workflow-defs";
import { formatRelative, formatFull } from "@/lib/relative-time";
import {
  COMPLAINT_ACTIONS, COMPLAINT_CATEGORY_LABEL, availableComplaintActions,
  type ComplaintAction, type ComplaintCategory,
} from "@/lib/complaint-rules";
import { ChevronLeft, Paperclip, Send, GitBranch, FolderOpen, Trash2, Eye, EyeOff, Phone } from "lucide-react";

interface TimelineEvent {
  id: string; kind: string; actorName: string | null; actorEmail: string | null; body: string | null;
  meta: { visibleToTenant?: boolean } | null; attachmentLinks?: { path: string; url: string | null }[]; createdAt: string;
}
interface ComplaintDetail {
  id: string;
  property: { id: string; name: string; currency: string };
  unit: { id: string; unitNumber: string } | null;
  subjectUnit: { id: string; unitNumber: string } | null;
  tenant: { id: string; name: string; phone: string | null } | null;
  category: ComplaintCategory;
  title: string;
  description: string | null;
  source: "STAFF" | "PORTAL";
  raisedByName: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  caseThread: {
    id: string; status: string; stage: string | null; currentStageIndex: number; waitingOn: string;
    terminalReason: "COMPLETED_NORMALLY" | "BYPASSED" | "CANCELLED" | null; bypassedAtStage: string | null; slaDueAt: string | null;
  } | null;
  events: TimelineEvent[];
}

const STATUS_BADGE: Record<string, "red" | "amber" | "blue" | "gray" | "green" | "gold"> = {
  OPEN: "red", IN_PROGRESS: "amber", AWAITING_APPROVAL: "gold", AWAITING_VENDOR: "blue", AWAITING_TENANT: "blue", RESOLVED: "green", CLOSED: "gray",
};
const SYSTEM_KINDS = new Set(["STATUS_CHANGE", "STAGE_CHANGE", "ASSIGNMENT", "VENDOR_ASSIGNED", "APPROVAL_REQUESTED", "APPROVAL_GRANTED", "APPROVAL_REJECTED", "EXTERNAL_UPDATE", "DOCUMENT_ADDED", "EMAIL_SENT"]);
const MANAGER_TIER = new Set(["ADMIN", "MANAGER", "ACCOUNTANT"]);

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const isManager = MANAGER_TIER.has(orgRole ?? "");

  const [c, setC] = useState<ComplaintDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composer, setComposer] = useState("");
  const [visibleToTenant, setVisibleToTenant] = useState(false);
  const [noteFor, setNoteFor] = useState<ComplaintAction | null>(null);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch(`/api/complaints/${id}`)
      .then(async (r) => { if (!r.ok) { setMissing(true); return null; } return r.json(); })
      .then((d) => { if (d) setC(d); })
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function runAction(action: ComplaintAction, noteText?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(noteText ? { note: noteText } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof body.error === "string" ? body.error : "Could not update"); return; }
      toast.success(COMPLAINT_ACTIONS[action].label);
      setNoteFor(null); setNote("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    const files = fileRef.current?.files;
    if (!composer.trim() && !files?.length) return;
    setSaving(true);
    try {
      const form = new FormData();
      if (composer.trim()) form.append("body", composer.trim());
      Array.from(files ?? []).forEach((f) => form.append("file", f));
      form.append("visibleToTenant", String(visibleToTenant));
      const res = await fetch(`/api/complaints/${id}/events`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof body.error === "string" ? body.error : "Could not add comment"); return; }
      setComposer(""); setVisibleToTenant(false);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const res = await fetch(`/api/complaints/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    toast.success("Complaint deleted");
    router.push("/complaints");
  }

  if (missing) {
    return (
      <div>
        <Header title="Complaint" />
        <div className="page-container"><p className="text-body text-gray-500">This complaint could not be found.</p></div>
      </div>
    );
  }
  if (!c) return <div className="flex justify-center py-16"><Spinner /></div>;

  const ct = c.caseThread;
  const actions = ct ? availableComplaintActions(orgRole, ct.currentStageIndex) : [];
  const isTerminal = ct?.status === "RESOLVED" || ct?.status === "CLOSED";
  const slaOverdue = !!ct?.slaDueAt && !isTerminal && new Date(ct.slaDueAt).getTime() < Date.now();

  return (
    <div>
      <Header title={c.title} />
      <div className="page-container pb-24 lg:pb-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-body">
          <Link href="/complaints" className="text-gray-500 hover:text-gold inline-flex items-center gap-1"><ChevronLeft size={14} /> Complaints</Link>
          <span className="text-gray-300">/</span>
          {ct && <Badge variant={STATUS_BADGE[ct.status] ?? "gray"}>{ct.stage ?? ct.status}</Badge>}
          <Badge variant="gray">{COMPLAINT_CATEGORY_LABEL[c.category] ?? c.category}</Badge>
          <Badge variant={c.source === "PORTAL" ? "blue" : "gray"}>{c.source === "PORTAL" ? "Tenant portal" : `Logged by ${c.raisedByName}`}</Badge>
          <Badge variant="blue">{c.property.name}{c.subjectUnit ? ` · ${c.subjectUnit.unitNumber}` : c.unit ? ` · ${c.unit.unitNumber}` : ""}</Badge>
          {slaOverdue && <Badge variant="red">Past SLA</Badge>}
          {isManager && ct && (
            <Link href={`/cases/${ct.id}`} className="ml-auto text-caption text-gray-500 hover:text-gold inline-flex items-center gap-1">
              <FolderOpen size={12} /> Open as case
            </Link>
          )}
        </div>

        {ct && (
          <div className="mb-4">
            <StageTracker
              workflow={getWorkflow("COMPLAINT")}
              currentStageIndex={ct.currentStageIndex}
              waitingOn={ct.waitingOn}
              terminalReason={ct.terminalReason}
              bypassedAtStage={ct.bypassedAtStage}
              readOnly
              onAdvance={() => {}}
              onRegress={() => {}}
            />
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {/* Timeline + composer */}
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-h3 mb-3">Timeline</h3>
            <div className="space-y-3">
              {c.events.map((e) => {
                const short = formatRelative(e.createdAt);
                const full = formatFull(e.createdAt);
                if (SYSTEM_KINDS.has(e.kind) && !(e.kind === "DOCUMENT_ADDED" && e.attachmentLinks?.length)) {
                  return (
                    <div key={e.id} className="flex items-start gap-2 text-caption text-gray-500 py-1.5 px-2 bg-gray-50 rounded">
                      <GitBranch size={12} className="mt-0.5 text-gray-400" />
                      <span className="flex-1">{e.body ?? e.kind}</span>
                      <span title={full} className="text-gray-400">{short}</span>
                    </div>
                  );
                }
                const shared = e.meta?.visibleToTenant === true;
                return (
                  <div key={e.id} className="rounded-lg bg-cream/40 border border-gray-100 p-3">
                    <div className="flex items-center justify-between text-caption text-gray-500 mb-1 gap-2">
                      <span className="font-medium text-gray-700">{e.actorName ?? e.actorEmail ?? "Unknown"}</span>
                      <span className="flex items-center gap-2">
                        {c.tenant && (
                          <span className={shared ? "text-income flex items-center gap-1" : "text-gray-400 flex items-center gap-1"} title={shared ? "Visible to the tenant in their portal" : "Internal note"}>
                            {shared ? <Eye size={11} /> : <EyeOff size={11} />}{shared ? "Tenant can see" : "Internal"}
                          </span>
                        )}
                        <span title={full}>{short}</span>
                      </span>
                    </div>
                    {e.body && <p className="text-body whitespace-pre-wrap">{e.body}</p>}
                    {e.attachmentLinks && e.attachmentLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {e.attachmentLinks.map((a, i) => (
                          <a key={a.path} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption text-gold hover:underline">
                            <Paperclip size={12} /> Attachment {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {c.events.length === 0 && <p className="text-body text-gray-400">No activity yet.</p>}
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <textarea value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Add a note or update…" rows={3}
                className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50" />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" capture="environment" className="text-caption" />
                <div className="flex items-center gap-3">
                  {c.tenant && (
                    <label className="flex items-center gap-1.5 text-caption text-gray-600 cursor-pointer select-none">
                      <input type="checkbox" checked={visibleToTenant} onChange={(e) => setVisibleToTenant(e.target.checked)} className="rounded accent-gold" />
                      Visible to tenant
                    </label>
                  )}
                  <Button onClick={postComment} disabled={saving}><Send size={14} /> Add</Button>
                </div>
              </div>
              <p className="mt-1.5 text-caption text-gray-400">Notes are internal unless you tick &ldquo;Visible to tenant&rdquo;. Photos: up to 8 per note, 10 MB each.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
            <div>
              <h3 className="text-h3 mb-2">Actions</h3>
              {actions.length === 0 && <p className="text-caption text-gray-400">{isTerminal ? "This complaint is closed." : "No actions available for your role at this stage."}</p>}
              <div className="flex flex-col gap-2">
                {actions.map((a) => {
                  const def = COMPLAINT_ACTIONS[a];
                  const danger = a === "close";
                  return noteFor === a ? (
                    <div key={a} className="space-y-2">
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={a === "reopen" ? "Why is it being reopened? *" : "What was done? (shown to the tenant, optional)"}
                        className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
                      <div className="flex gap-2">
                        <Button size="sm" loading={saving} disabled={a === "reopen" && !note.trim()} onClick={() => runAction(a, note.trim() || undefined)}>{def.label}</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setNoteFor(null); setNote(""); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button key={a} size="sm" variant={danger || a === "reopen" ? "secondary" : "primary"} disabled={saving}
                      onClick={() => (a === "reopen" || a === "resolve" ? setNoteFor(a) : runAction(a))}>
                      {def.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-caption text-gray-600">
              <div className="text-label uppercase text-gray-400 mb-1">Details</div>
              <div><span className="text-gray-400">Raised</span> {formatFull(c.createdAt)} by {c.raisedByName}</div>
              {c.acknowledgedAt && <div><span className="text-gray-400">Acknowledged</span> {formatFull(c.acknowledgedAt)}</div>}
              {c.resolvedAt && <div><span className="text-gray-400">Resolved</span> {formatFull(c.resolvedAt)}</div>}
              {ct?.slaDueAt && !isTerminal && <div className={slaOverdue ? "text-expense" : ""}><span className="text-gray-400">SLA</span> {formatFull(ct.slaDueAt)}</div>}
              {c.tenant && (
                <div className="pt-1">
                  <span className="text-gray-400">Complainant</span> {c.tenant.name}{c.unit ? ` (${c.unit.unitNumber})` : ""}
                  {c.tenant.phone && <a href={`tel:${c.tenant.phone}`} className="ml-2 inline-flex items-center gap-1 text-gold hover:underline"><Phone size={11} /> {c.tenant.phone}</a>}
                </div>
              )}
              {c.subjectUnit && <div><span className="text-gray-400">Unit concerned</span> {c.subjectUnit.unitNumber}</div>}
              {c.description && <p className="pt-2 whitespace-pre-wrap text-gray-700">{c.description}</p>}
            </div>

            {isManager && (
              <div className="border-t border-gray-100 pt-3">
                <button onClick={() => setConfirmDelete(true)} className="text-caption text-gray-400 hover:text-expense inline-flex items-center gap-1">
                  <Trash2 size={12} /> Delete complaint
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this complaint?"
        message="The complaint and its whole timeline (notes, photos) will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
