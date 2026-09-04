"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FileText, Upload, X, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/date-utils";
import {
  INSURANCE_DOCUMENT_CATEGORIES,
  INSURANCE_DOCUMENT_CATEGORY_LABEL,
  INSURANCE_DOCUMENT_ACCEPT,
  INSURANCE_DOCUMENT_MAX_MB,
  isAllowedInsuranceDocument,
  sortInsuranceDocuments,
} from "@/lib/insurance-documents";

export interface PolicyDocument {
  id: string;
  policyId: string;
  category: string;
  label: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  documentDate: string | null;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  uploadedAt: string;
}

interface QueueItem {
  id: string;
  file: File;
  category: string;
  label: string;
  documentDate: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

export interface InsuranceDocumentsHandle {
  /** Create-policy flow: push every queued file to the policy that now exists. */
  uploadAllTo: (policyId: string) => Promise<{ done: number; failed: string[] }>;
  hasQueued: () => boolean;
}

interface Props {
  /** When set, files upload as soon as they are chosen. When absent (the
   *  create-policy form), they queue until the parent calls uploadAllTo(). */
  policyId?: string;
  /** Fires after any successful upload or delete with the new document list. */
  onChanged?: (docs: PolicyDocument[]) => void;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORY_BADGE: Record<string, "blue" | "green" | "gold" | "amber" | "red" | "gray"> = {
  POLICY_SCHEDULE: "blue",
  CERTIFICATE: "green",
  VALUATION_REPORT: "gold",
  INSURER_ASSESSMENT: "amber",
  CLAIM: "red",
  INVOICE_RECEIPT: "gray",
  OTHER: "gray",
};

const inputCls = "text-body border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/30";

async function uploadOne(policyId: string, item: QueueItem): Promise<{ ok: true; doc: PolicyDocument } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("file", item.file);
  fd.append("category", item.category);
  fd.append("label", item.label || item.file.name);
  if (item.documentDate) fd.append("documentDate", item.documentDate);
  try {
    const res = await fetch(`/api/insurance/${policyId}/documents`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || `Upload failed (${res.status})` };
    return { ok: true, doc: body as PolicyDocument };
  } catch {
    return { ok: false, error: "Network error — check your connection and retry." };
  }
}

export const InsuranceDocuments = forwardRef<InsuranceDocumentsHandle, Props>(function InsuranceDocuments(
  { policyId, onChanged },
  ref,
) {
  const [docs, setDocs] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(!!policyId);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [category, setCategory] = useState<string>("POLICY_SCHEDULE");
  const [label, setLabel] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;

  const loadDocs = useCallback(async () => {
    if (!policyId) return;
    try {
      const res = await fetch(`/api/insurance/${policyId}/documents`);
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const patchItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const runUpload = useCallback(async (targetPolicyId: string, item: QueueItem): Promise<boolean> => {
    patchItem(item.id, { status: "uploading", error: undefined });
    const result = await uploadOne(targetPolicyId, item);
    if (result.ok) {
      patchItem(item.id, { status: "done" });
      setDocs((d) => {
        const next = [result.doc, ...d];
        onChanged?.(next);
        return next;
      });
      // Clear the finished row after a beat so the list doesn't jump.
      setTimeout(() => setQueue((q) => q.filter((i) => i.id !== item.id)), 900);
      return true;
    }
    patchItem(item.id, { status: "error", error: result.error });
    return false;
  }, [onChanged]);

  function addFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const fresh: QueueItem[] = [];
    Array.from(files).forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let error: string | undefined;
      if (!isAllowedInsuranceDocument(file)) error = "Not a supported file type (PDF, image, Word or Excel).";
      else if (file.size > INSURANCE_DOCUMENT_MAX_MB * 1024 * 1024) error = `Too large — the maximum is ${INSURANCE_DOCUMENT_MAX_MB} MB.`;
      fresh.push({ id, file, category, label: files.length === 1 ? label : "", documentDate, status: error ? "error" : "queued", error });
    });
    setQueue((q) => [...q, ...fresh]);
    setLabel("");
    if (fileRef.current) fileRef.current.value = "";
    if (policyId) {
      // Immediate mode: sequential so a burst of uploads doesn't race storage.
      (async () => {
        for (const item of fresh) if (item.status === "queued") await runUpload(policyId, item);
      })();
    }
  }

  useImperativeHandle(ref, () => ({
    hasQueued: () => queueRef.current.some((i) => i.status === "queued" || i.status === "error"),
    uploadAllTo: async (targetPolicyId: string) => {
      let done = 0;
      const failed: string[] = [];
      for (const item of queueRef.current) {
        if (item.status === "done" || item.status === "uploading") continue;
        if (item.status === "error" && !item.file) continue;
        const ok = await runUpload(targetPolicyId, item);
        if (ok) done += 1; else failed.push(item.file.name);
      }
      return { done, failed };
    },
  }), [runUpload]);

  async function handleDelete(docId: string) {
    if (!policyId) return;
    const res = await fetch(`/api/insurance/${policyId}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Document deleted");
      setDocs((d) => {
        const next = d.filter((x) => x.id !== docId);
        onChanged?.(next);
        return next;
      });
    } else {
      toast.error("Delete failed");
    }
    setDeleteDocId(null);
  }

  const sorted = sortInsuranceDocuments(docs);

  return (
    <div className="space-y-3">
      {/* Existing documents */}
      {policyId && (loading ? (
        <div className="py-2 flex justify-center"><Spinner size="sm" /></div>
      ) : sorted.length === 0 ? (
        <p className="text-body text-gray-400">No documents on this policy yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {sorted.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2 text-body">
              <FileText size={15} className="text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={CATEGORY_BADGE[doc.category] ?? "gray"}>{INSURANCE_DOCUMENT_CATEGORY_LABEL[doc.category] ?? doc.category}</Badge>
                  {doc.fileUrl ? (
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-dark truncate inline-flex items-center gap-1 font-medium">
                      {doc.label}<ExternalLink size={11} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate text-gray-500" title="Storage is unavailable right now">{doc.label}</span>
                  )}
                </div>
                <p className="text-caption text-gray-400 truncate">
                  {[
                    doc.documentDate ? `Dated ${formatDate(new Date(doc.documentDate))}` : null,
                    doc.fileName !== doc.label ? doc.fileName : null,
                    formatBytes(doc.fileSize) || null,
                    doc.uploadedByName ? `by ${doc.uploadedByName}` : null,
                    `uploaded ${formatDate(new Date(doc.uploadedAt))}`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button onClick={() => setDeleteDocId(doc.id)} className="text-gray-400 hover:text-expense transition-colors shrink-0" title="Delete document" aria-label={`Delete ${doc.label}`}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ))}

      {/* Queue / in-flight rows */}
      {queue.length > 0 && (
        <ul className="space-y-1.5">
          {queue.map((item) => (
            <li key={item.id} className={`rounded-lg border px-3 py-2 text-body ${item.status === "error" ? "border-red-200 bg-red-50/50" : "border-gray-100 bg-cream/40"}`}>
              <div className="flex items-center gap-2">
                {item.status === "uploading" && <Loader2 size={14} className="animate-spin text-gold shrink-0" />}
                {item.status === "done" && <CheckCircle2 size={14} className="text-income shrink-0" />}
                {item.status === "error" && <AlertCircle size={14} className="text-expense shrink-0" />}
                {item.status === "queued" && <FileText size={14} className="text-gray-400 shrink-0" />}
                <span className="truncate flex-1 font-medium">{item.file.name}</span>
                <span className="text-caption text-gray-400 shrink-0">{formatBytes(item.file.size)}</span>
                {item.status === "error" && policyId && (
                  <button onClick={() => runUpload(policyId, item)} className="text-caption text-gold hover:text-gold-dark inline-flex items-center gap-1" title="Retry">
                    <RefreshCw size={12} /> Retry
                  </button>
                )}
                {item.status !== "uploading" && item.status !== "done" && (
                  <button onClick={() => setQueue((q) => q.filter((i) => i.id !== item.id))} className="text-gray-400 hover:text-expense shrink-0" aria-label="Remove">
                    <X size={14} />
                  </button>
                )}
              </div>
              {item.status === "queued" && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={item.category} onChange={(e) => patchItem(item.id, { category: e.target.value })} className={inputCls} aria-label="Category">
                    {INSURANCE_DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <input value={item.label} onChange={(e) => patchItem(item.id, { label: e.target.value })} placeholder="Label (optional)" className={inputCls} aria-label="Label" />
                  <input type="date" value={item.documentDate} onChange={(e) => patchItem(item.id, { documentDate: e.target.value })} className={inputCls} aria-label="Document date" title="The date on the document, e.g. the valuation date" />
                </div>
              )}
              {item.error && <p className="mt-1 text-caption text-expense">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Add row */}
      <div className="rounded-lg border border-dashed border-gray-200 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} aria-label="Document category" title={INSURANCE_DOCUMENT_CATEGORIES.find((c) => c.value === category)?.hint}>
            {INSURANCE_DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className={inputCls} aria-label="Document label" />
          <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className={inputCls} aria-label="Document date" title="The date on the document, e.g. the valuation date" />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-caption text-gray-400">PDF, images, Word or Excel · up to {INSURANCE_DOCUMENT_MAX_MB} MB each{policyId ? "" : " · uploaded when the policy is saved"}</p>
          <label className="cursor-pointer">
            <input ref={fileRef} type="file" multiple accept={INSURANCE_DOCUMENT_ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cream rounded-lg text-body text-header hover:bg-cream-dark transition-colors">
              <Upload size={13} /> Choose files
            </span>
          </label>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteDocId}
        title="Delete document"
        message="Are you sure you want to delete this document? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteDocId && handleDelete(deleteDocId)}
        onClose={() => setDeleteDocId(null)}
      />
    </div>
  );
});
