"use client";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Upload, X, Loader2, Camera, FileText, RefreshCw, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

export const EXPENSE_DOCUMENT_CATEGORIES = [
  { value: "RECEIPT",  label: "Receipt" },
  { value: "INVOICE",  label: "Invoice" },
  { value: "QUOTE",    label: "Quote" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PHOTO",    label: "Photo" },
  { value: "OTHER",    label: "Other" },
] as const;

const MAX_MB = 10;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx";
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp|heic|heif|docx?)$/i;
/** Types the canvas can decode — candidates for client-side compression. */
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const COMPRESS_THRESHOLD = 1_500_000; // bytes — smaller files upload as-is
const MAX_DIMENSION = 2200; // px — plenty for a legible receipt

interface QueueItem {
  id: string;
  file: File;
  originalSize: number;
  previewUrl: string | null;
  label: string;
  category: string;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

export interface ExpenseDocumentUploadHandle {
  /** Deferred mode: push every queued file to the given expense. */
  uploadAllTo: (expenseId: string) => Promise<{ done: number; failed: string[] }>;
  hasQueued: () => boolean;
}

interface Props {
  /** When set, files upload immediately on add. When absent (create-expense
   *  flow), files queue locally until the parent calls uploadAllTo(). */
  expenseId?: string;
  onUploaded?: () => void;
  /** Already-attached files, for client-side duplicate warnings. */
  existingFiles?: { fileName: string; fileSize: number | null }[];
}

function isAllowed(file: File): boolean {
  return file.type ? ALLOWED_TYPES.has(file.type) : ALLOWED_EXTENSIONS.test(file.name);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Downscale + re-encode large canvas-decodable images; anything else passes through. */
async function maybeCompress(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < COMPRESS_THRESHOLD) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file; // keep original if no win
    const newName = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file; // decode failed — upload the original
  }
}

/** XHR (not fetch) so we get upload-progress events. */
function uploadWithProgress(
  url: string,
  fd: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; status: number; body: { error?: string } | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, body: null });
    xhr.send(fd);
  });
}

export const ExpenseDocumentUpload = forwardRef<ExpenseDocumentUploadHandle, Props>(
  function ExpenseDocumentUpload({ expenseId, onUploaded, existingFiles = [] }, ref) {
    const browseRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [dragOver, setDragOver] = useState(false);
    // Latest queue for the imperative uploadAllTo (avoids stale closure).
    const queueRef = useRef<QueueItem[]>([]);
    queueRef.current = queue;

    const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
      setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    }, []);

    async function uploadItem(targetExpenseId: string, item: QueueItem): Promise<boolean> {
      patchItem(item.id, { status: "uploading", progress: 0, error: undefined });
      const fd = new FormData();
      fd.append("file", item.file);
      fd.append("category", item.category);
      fd.append("label", item.label || item.file.name);
      const res = await uploadWithProgress(
        `/api/expenses/${targetExpenseId}/documents`,
        fd,
        (pct) => patchItem(item.id, { progress: pct }),
      );
      if (res.ok) {
        patchItem(item.id, { status: "done", progress: 100 });
        // Let the ✓ flash briefly, then drop the row (the gallery shows it now).
        setTimeout(() => {
          setQueue((prev) => prev.filter((it) => it.id !== item.id));
        }, 900);
        return true;
      }
      patchItem(item.id, {
        status: "error",
        error: res.body?.error ?? (res.status === 0 ? "Network error — check your connection." : `Upload failed (${res.status})`),
      });
      return false;
    }

    async function uploadSequentially(targetExpenseId: string, items: QueueItem[]) {
      let anyDone = false;
      for (const item of items) {
        const ok = await uploadItem(targetExpenseId, item);
        anyDone = anyDone || ok;
      }
      if (anyDone) onUploaded?.();
    }

    async function addFiles(list: FileList | File[]) {
      const incoming = Array.from(list);
      const prepared: QueueItem[] = [];

      for (const raw of incoming) {
        const reject = (error: string) => {
          prepared.push({
            id: crypto.randomUUID(), file: raw, originalSize: raw.size, previewUrl: null,
            label: "", category: "RECEIPT", status: "error", progress: 0, error,
          });
        };

        if (!isAllowed(raw)) {
          reject(`Not a supported type — upload an image (JPG, PNG, HEIC, WebP) or a PDF.`);
          continue;
        }
        const dupInQueue = queueRef.current.some(
          (q) => q.status !== "error" && q.file.name === raw.name && q.originalSize === raw.size,
        ) || prepared.some((q) => q.status !== "error" && q.file.name === raw.name && q.originalSize === raw.size);
        const dupExisting = existingFiles.some((d) => d.fileName === raw.name && d.fileSize === raw.size);
        if (dupInQueue || dupExisting) {
          reject("This file is already attached.");
          continue;
        }

        const file = await maybeCompress(raw);
        if (file.size > MAX_MB * 1024 * 1024) {
          reject(`Too large (${formatBytes(file.size)}) — the maximum is ${MAX_MB} MB per file.`);
          continue;
        }

        prepared.push({
          id: crypto.randomUUID(),
          file,
          originalSize: raw.size,
          previewUrl: file.type.startsWith("image/") && !/hei[cf]/.test(file.type)
            ? URL.createObjectURL(file)
            : null,
          label: raw.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
          category: "RECEIPT",
          status: "queued",
          progress: 0,
        });
      }

      setQueue((prev) => [...prev, ...prepared]);

      // Immediate mode: valid files start uploading as soon as they're added.
      if (expenseId) {
        const valid = prepared.filter((p) => p.status === "queued");
        if (valid.length > 0) void uploadSequentially(expenseId, valid);
      }
    }

    function removeItem(id: string) {
      setQueue((prev) => {
        const item = prev.find((it) => it.id === id);
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
        return prev.filter((it) => it.id !== id);
      });
    }

    useImperativeHandle(ref, () => ({
      hasQueued: () => queueRef.current.some((it) => it.status === "queued" || it.status === "error"),
      async uploadAllTo(targetExpenseId: string) {
        const pending = queueRef.current.filter((it) => it.status === "queued" || it.status === "error");
        let done = 0;
        const failed: string[] = [];
        for (const item of pending) {
          // Client-rejected rows (bad type/size) can't succeed — surface them as failures.
          if (item.status === "error" && item.error && !item.error.startsWith("Upload failed") && !item.error.startsWith("Network")) {
            failed.push(`${item.file.name}: ${item.error}`);
            continue;
          }
          const ok = await uploadItem(targetExpenseId, item);
          if (ok) done++;
          else {
            const after = queueRef.current.find((it) => it.id === item.id);
            failed.push(`${item.file.name}: ${after?.error ?? "upload failed"}`);
          }
        }
        if (done > 0) onUploaded?.();
        return { done, failed };
      },
    }));

    const uploadingCount = queue.filter((it) => it.status === "uploading").length;

    return (
      <div className="space-y-3">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
          }}
          onClick={() => browseRef.current?.click()}
          className={clsx(
            "border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors",
            dragOver ? "border-gold bg-gold/5" : "border-gray-200 hover:border-gold/50 hover:bg-cream",
          )}
        >
          <Upload size={18} className="text-gray-400" />
          <p className="text-body text-gray-500 text-center">
            Drop receipts here, or <span className="text-gold font-medium">browse</span>
          </p>
          <p className="text-caption text-gray-400 ">JPG, PNG, HEIC, WebP or PDF · max {MAX_MB} MB each</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); cameraRef.current?.click(); }}
            className="mt-1 flex items-center gap-1.5 text-caption font-medium text-gold border border-gold/40 px-3 py-1.5 rounded-lg hover:bg-gold/10 transition-colors"
          >
            <Camera size={13} /> Take photo
          </button>
          <input
            ref={browseRef}
            type="file"
            multiple
            className="hidden"
            accept={ACCEPT}
            onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }}
          />
          <input
            ref={cameraRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className={clsx(
                  "flex items-center gap-3 p-2.5 rounded-xl border bg-white",
                  item.status === "error" ? "border-red-200 bg-red-50/40" : "border-gray-100",
                )}
              >
                {/* Preview thumb */}
                <div className="w-12 h-12 rounded-lg bg-cream overflow-hidden flex items-center justify-center shrink-0">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <FileText size={18} className="text-gold" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {item.status === "error" ? (
                    <>
                      <p className="text-body font-medium text-header truncate">{item.file.name}</p>
                      <p className="text-caption text-expense mt-0.5">{item.error}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={item.label}
                          disabled={item.status !== "queued"}
                          onChange={(e) => patchItem(item.id, { label: e.target.value })}
                          placeholder="Caption (optional)"
                          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-caption text-gray-700 focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <select
                          value={item.category}
                          disabled={item.status !== "queued"}
                          onChange={(e) => patchItem(item.id, { category: e.target.value })}
                          className="border border-gray-200 rounded-lg px-1.5 py-1 text-caption text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:bg-gray-50"
                        >
                          {EXPENSE_DOCUMENT_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-caption text-gray-400 mt-1 truncate">
                        {item.file.name} · {formatBytes(item.file.size)}
                        {item.file.size < item.originalSize && (
                          <span className="text-income"> (compressed from {formatBytes(item.originalSize)})</span>
                        )}
                      </p>
                      {item.status === "uploading" && (
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
                          <div className="bg-gold h-1.5 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Status / actions */}
                <div className="shrink-0 flex items-center gap-1">
                  {item.status === "uploading" && <Loader2 size={15} className="animate-spin text-gold" />}
                  {item.status === "done" && <CheckCircle2 size={15} className="text-income" />}
                  {item.status === "error" && expenseId && item.error?.match(/^(Upload failed|Network)/) && (
                    <button
                      type="button"
                      onClick={() => void uploadSequentially(expenseId, [item])}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
                      title="Retry upload"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                  {item.status !== "uploading" && item.status !== "done" && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 transition-colors"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {!expenseId && queue.some((it) => it.status === "queued") && (
              <p className="text-caption text-gray-400 ">
                {queue.filter((it) => it.status === "queued").length} file
                {queue.filter((it) => it.status === "queued").length !== 1 ? "s" : ""} will upload when the expense is saved.
              </p>
            )}
            {uploadingCount > 0 && (
              <p className="text-caption text-gray-400 ">Uploading {uploadingCount} file{uploadingCount !== 1 ? "s" : ""}…</p>
            )}
          </div>
        )}
      </div>
    );
  },
);
