"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import toast from "react-hot-toast";
import {
  Wrench, ChevronLeft, MessageSquare, Paperclip,
  GitBranch, UserCheck, Send, Mail, Briefcase, ShieldQuestion,
} from "lucide-react";
import { formatRelative, formatFull } from "@/lib/relative-time";
import { EmailDraftModal } from "@/components/tenants/EmailDraftModal";
import { VendorEmailModal } from "@/components/cases/VendorEmailModal";
import { StageTracker } from "@/components/cases/StageTracker";
import { Modal } from "@/components/ui/Modal";
import { getWorkflow } from "@/lib/case-workflows";

type CaseStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_APPROVAL" | "AWAITING_VENDOR" | "AWAITING_TENANT" | "RESOLVED" | "CLOSED";
type CaseWaitingOn = "MANAGER" | "OWNER" | "TENANT" | "VENDOR" | "NONE";

interface CaseEvent {
  id: string;
  kind: string;
  actorEmail: string | null;
  actorName: string | null;
  body: string | null;
  meta: unknown;
  attachmentUrls: string[];
  attachmentLinks?: { path: string; url: string | null }[];
  createdAt: string;
}

interface CaseDetail {
  id: string;
  caseType: "MAINTENANCE" | "LEASE_RENEWAL" | "ARREARS" | "COMPLIANCE" | "GENERAL";
  subjectId: string;
  title: string;
  status: CaseStatus;
  stage: string | null;
  currentStageIndex: number;
  workflowKey: string | null;
  waitingOn: CaseWaitingOn;
  assignedToUserId: string | null;
  property: { id: string; name: string; currency: string };
  unit: { id: string; unitNumber: string } | null;
  assignedTo: { id: string; name: string | null; email: string | null } | null;
  events: CaseEvent[];
  tenantContext: {
    id: string; name: string; email: string | null;
    monthlyRent: number; serviceCharge: number;
    leaseEnd: string | null; proposedRent: number | null; proposedLeaseEnd: string | null;
  } | null;
  vendorContext: { id: string; name: string; email: string | null } | null;
}

const STATUS_BADGE: Record<CaseStatus, "red" | "amber" | "blue" | "gray" | "green" | "gold"> = {
  OPEN: "red", IN_PROGRESS: "amber", AWAITING_APPROVAL: "gold",
  AWAITING_VENDOR: "blue", AWAITING_TENANT: "blue", RESOLVED: "green", CLOSED: "gray",
};

const SYSTEM_KINDS = new Set([
  "STATUS_CHANGE", "STAGE_CHANGE", "ASSIGNMENT", "VENDOR_ASSIGNED",
  "APPROVAL_REQUESTED", "APPROVAL_GRANTED", "APPROVAL_REJECTED",
  "EXTERNAL_UPDATE", "DOCUMENT_ADDED", "EMAIL_SENT",
]);

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<CaseDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [composer, setComposer] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [emailTenantOpen, setEmailTenantOpen] = useState(false);
  const [emailVendorOpen, setEmailVendorOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/cases/${id}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function patch(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast.error("Failed to update case");
    } finally {
      setSaving(false);
    }
  }

  async function postComment() {
    if (!composer.trim() && !fileRef.current?.files?.length) return;
    setSaving(true);
    try {
      const files = fileRef.current?.files;
      let res: Response;
      if (files && files.length > 0) {
        const form = new FormData();
        if (composer.trim()) form.append("body", composer);
        Array.from(files).forEach((f) => form.append("file", f));
        res = await fetch(`/api/cases/${id}/events`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/cases/${id}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "COMMENT", body: composer }),
        });
      }
      if (!res.ok) throw new Error();
      setComposer("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <>
        <Header title="Case" />
        <div className="page-container"><div className="flex justify-center py-12"><Spinner /></div></div>
      </>
    );
  }

  const c = data;

  return (
    <>
      <Header title={c.title} />
      <div className="page-container">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-sans">
          <Link href="/cases" className="text-gray-500 hover:text-gold inline-flex items-center gap-1">
            <ChevronLeft size={14} /> Cases
          </Link>
          <span className="text-gray-300">/</span>
          <Badge variant={STATUS_BADGE[c.status]}>{c.status.replace(/_/g, " ")}</Badge>
          {c.stage && <Badge variant="gray">{c.stage}</Badge>}
          <Badge variant="gold">Waiting: {c.waitingOn}</Badge>
          <Badge variant="blue">{c.property.name}{c.unit ? ` · ${c.unit.unitNumber}` : ""}</Badge>
          {c.caseType === "MAINTENANCE" && (
            <Link
              href={`/maintenance?jobId=${c.subjectId}`}
              className="ml-auto text-xs text-gray-500 hover:text-gold inline-flex items-center gap-1"
            >
              <Wrench size={12} /> View as maintenance job
            </Link>
          )}
        </div>

        <div className="mb-4">
          <StageTracker
            workflow={getWorkflow(c.caseType)}
            currentStageIndex={c.currentStageIndex}
            waitingOn={c.waitingOn}
            readOnly={c.status === "RESOLVED" || c.status === "CLOSED"}
            onAdvance={async (toIndex, note) => {
              const res = await fetch(`/api/cases/${c.id}/advance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: toIndex, note }),
              });
              if (!res.ok) { toast.error("Failed to advance"); return; }
              toast.success("Stage advanced");
              load();
            }}
            onRegress={async (reason) => {
              const res = await fetch(`/api/cases/${c.id}/regress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
              });
              if (!res.ok) { toast.error("Failed to regress"); return; }
              toast.success("Stage regressed");
              load();
            }}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Timeline + composer */}
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-display text-base mb-3">Timeline</h3>
            <div className="space-y-3">
              {c.events.map((e) => {
                const isSystem = SYSTEM_KINDS.has(e.kind);
                const short = formatRelative(e.createdAt);
                const full = formatFull(e.createdAt);
                if (isSystem) {
                  return (
                    <div key={e.id} className="flex items-start gap-2 text-xs font-sans text-gray-500 py-1.5 px-2 bg-gray-50 rounded">
                      <GitBranch size={12} className="mt-0.5 text-gray-400" />
                      <span className="flex-1">{e.body ?? e.kind}</span>
                      <span title={full} className="text-gray-400">{short}</span>
                    </div>
                  );
                }
                return (
                  <div key={e.id} className="rounded-lg bg-cream/40 border border-gray-100 p-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 font-sans mb-1">
                      <span className="font-medium text-gray-700">{e.actorName ?? e.actorEmail ?? "Unknown"}</span>
                      <span title={full}>{short}</span>
                    </div>
                    {e.body && <p className="text-sm font-sans whitespace-pre-wrap">{e.body}</p>}
                    {e.attachmentLinks && e.attachmentLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {e.attachmentLinks.map((a) => (
                          <a
                            key={a.path}
                            href={a.url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                          >
                            <Paperclip size={12} /> Attachment
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {c.events.length === 0 && (
                <p className="text-sm font-sans text-gray-400">No activity yet.</p>
              )}
            </div>

            {/* Composer */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
              />
              <div className="flex items-center justify-between mt-2">
                <input ref={fileRef} type="file" multiple className="text-xs font-sans" />
                <Button onClick={postComment} disabled={saving}>
                  <Send size={14} /> Add comment
                </Button>
              </div>
            </div>
          </div>

          {/* Action panel */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <h3 className="font-display text-base">Actions</h3>
            <Select
              label="Status"
              value={c.status}
              onChange={(e) => patch({ status: e.target.value })}
              options={[
                { value: "OPEN", label: "Open" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "AWAITING_APPROVAL", label: "Awaiting approval" },
                { value: "AWAITING_VENDOR", label: "Awaiting vendor" },
                { value: "AWAITING_TENANT", label: "Awaiting tenant" },
                { value: "RESOLVED", label: "Resolved" },
                { value: "CLOSED", label: "Closed" },
              ]}
            />
            <Select
              label="Waiting on"
              value={c.waitingOn}
              onChange={(e) => patch({ waitingOn: e.target.value })}
              options={[
                { value: "MANAGER", label: "Manager" },
                { value: "OWNER", label: "Owner" },
                { value: "TENANT", label: "Tenant" },
                { value: "VENDOR", label: "Vendor" },
                { value: "NONE", label: "Nobody" },
              ]}
            />
            <Input
              label="Stage"
              defaultValue={c.stage ?? ""}
              placeholder="e.g. Quote requested"
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (c.stage ?? "")) patch({ stage: v || null });
              }}
            />
            <div className="text-xs font-sans text-gray-500 pt-2 border-t border-gray-100 space-y-2">
              <p className="flex items-center gap-1"><UserCheck size={12} /> Assigned: {c.assignedTo?.name ?? c.assignedTo?.email ?? "—"}</p>

              {c.tenantContext && (
                <button
                  onClick={() => setEmailTenantOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-sans hover:bg-gray-50"
                >
                  <Mail size={14} /> Email tenant
                </button>
              )}
              {c.vendorContext && (
                <button
                  onClick={() => setEmailVendorOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-sans hover:bg-gray-50"
                >
                  <Briefcase size={14} /> Email vendor
                </button>
              )}
              <button
                onClick={() => setApprovalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gold text-white text-sm font-sans hover:bg-gold-dark"
              >
                <ShieldQuestion size={14} /> Request approval
              </button>
            </div>
          </div>
        </div>
      </div>

      {emailTenantOpen && c.tenantContext && (
        <EmailDraftModal
          tenant={c.tenantContext}
          tenantId={c.tenantContext.id}
          currency={c.property.currency}
          caseThreadId={c.id}
          onClose={() => setEmailTenantOpen(false)}
        />
      )}
      {emailVendorOpen && c.vendorContext && (
        <VendorEmailModal
          vendor={c.vendorContext}
          caseContext={{
            id: c.id,
            title: c.title,
            propertyName: c.property.name,
            unitNumber: c.unit?.unitNumber ?? null,
          }}
          caseThreadId={c.id}
          onClose={() => setEmailVendorOpen(false)}
        />
      )}
      {approvalOpen && (
        <RequestApprovalModal
          caseId={c.id}
          currency={c.property.currency}
          onClose={() => setApprovalOpen(false)}
          onCreated={() => { setApprovalOpen(false); load(); }}
        />
      )}
    </>
  );
}

function RequestApprovalModal({
  caseId, currency, onClose, onCreated,
}: {
  caseId: string;
  currency: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState(72);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email || !question) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedFromEmail: email,
          question,
          amount: amount ? Number(amount) : undefined,
          currency: amount ? currency : undefined,
          expiresInHours: hours,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Approval request sent");
      onCreated();
    } catch {
      toast.error("Failed to send approval request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Request approval" size="md">
      <div className="p-5 space-y-3">
        <Input
          label="Approver email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@example.com"
        />
        <div>
          <label className="text-sm font-medium text-gray-600 font-sans mb-1 block">Question</label>
          <textarea
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What needs sign-off? Include any context."
            className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50"
          />
        </div>
        <Input
          label={`Amount (${currency}) — optional`}
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="Expires in (hours)"
          type="number"
          min={1}
          max={168}
          value={hours}
          onChange={(e) => setHours(Math.max(1, Math.min(168, Number(e.target.value) || 72)))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={submit} loading={saving} disabled={!email || !question}>Send request</Button>
        </div>
      </div>
    </Modal>
  );
}
