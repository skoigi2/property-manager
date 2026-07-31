"use client";
import { useCallback, useEffect, useState } from "react";
import { FileText, Trash2, Loader2, Download, ChevronLeft, ChevronRight, X, User } from "lucide-react";
import { clsx } from "clsx";
import { EXPENSE_DOCUMENT_CATEGORIES } from "./ExpenseDocumentUpload";
import { format } from "date-fns";

interface Document {
  id:         string;
  category:   string;
  label:      string;
  fileName:   string;
  fileSize:   number | null;
  mimeType:   string | null;
  uploadedAt: string;
  uploadedByName?:  string | null;
  uploadedByEmail?: string | null;
  url:        string | null;
}

interface Props {
  expenseId: string;
  documents: Document[];
  onDeleted: () => void;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(value: string) {
  return EXPENSE_DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function categoryColor(value: string) {
  const map: Record<string, string> = {
    INVOICE:  "bg-blue-100 text-blue-700",
    RECEIPT:  "bg-green-100 text-green-700",
    QUOTE:    "bg-amber-100 text-amber-700",
    CONTRACT: "bg-purple-100 text-purple-700",
    PHOTO:    "bg-gray-100 text-gray-600",
    OTHER:    "bg-gray-100 text-gray-500",
  };
  return map[value] ?? "bg-gray-100 text-gray-500";
}

function isImage(doc: Document) {
  if (doc.mimeType?.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(doc.fileName);
}

function isPdf(doc: Document) {
  return doc.mimeType === "application/pdf" || /\.pdf$/i.test(doc.fileName);
}

export function ExpenseDocumentList({ expenseId, documents, onDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<Document | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Only image/PDF docs open in the viewer; keep an index map into `documents`.
  const viewable = documents
    .map((doc, i) => ({ doc, i }))
    .filter(({ doc }) => doc.url && (isImage(doc) || isPdf(doc)));

  const openViewer = (docIndex: number) => {
    const pos = viewable.findIndex(({ i }) => i === docIndex);
    if (pos >= 0) setViewerIndex(pos);
  };

  const step = useCallback((dir: 1 | -1) => {
    setViewerIndex((prev) =>
      prev === null ? prev : (prev + dir + viewable.length) % viewable.length);
  }, [viewable.length]);

  // Keyboard: Escape closes, arrows navigate.
  useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerIndex(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, step]);

  async function handleDelete(doc: Document) {
    setConfirmDoc(null);
    setDeletingId(doc.id);
    try {
      await fetch(`/api/expenses/${expenseId}/documents/${doc.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 gap-2 text-gray-400">
        <FileText size={24} className="opacity-30" />
        <p className="text-body ">No receipts or documents attached yet</p>
      </div>
    );
  }

  const current = viewerIndex !== null ? viewable[viewerIndex]?.doc : null;

  return (
    <>
      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {documents.map((doc, i) => {
          const clickable = !!doc.url && (isImage(doc) || isPdf(doc));
          return (
            <div key={doc.id} className="rounded-xl border border-gray-100 bg-white overflow-hidden group">
              {/* Preview */}
              <button
                type="button"
                onClick={() => clickable && openViewer(i)}
                className={clsx(
                  "w-full h-24 bg-cream flex items-center justify-center overflow-hidden",
                  clickable ? "cursor-zoom-in" : "cursor-default",
                )}
                title={clickable ? "Click to view full screen" : undefined}
              >
                {doc.url && isImage(doc) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={doc.url}
                    alt={doc.label}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gold">
                    <FileText size={22} />
                    <span className="text-label uppercase text-gray-400">
                      {isPdf(doc) ? "PDF" : (doc.fileName.split(".").pop() ?? "file").toUpperCase()}
                    </span>
                  </div>
                )}
              </button>

              {/* Meta */}
              <div className="p-2.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-caption font-medium text-header truncate flex-1" title={doc.label}>{doc.label}</p>
                  <span className={clsx("text-caption px-1.5 py-0.5 rounded shrink-0", categoryColor(doc.category))}>
                    {categoryLabel(doc.category)}
                  </span>
                </div>
                <p className="text-caption text-gray-400 mt-0.5 truncate" title={doc.fileName}>
                  {format(new Date(doc.uploadedAt), "d MMM yyyy")}
                  {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
                </p>
                {(doc.uploadedByName || doc.uploadedByEmail) && (
                  <p className="text-caption text-gray-400 truncate flex items-center gap-1" title={doc.uploadedByEmail ?? undefined}>
                    <User size={10} className="shrink-0" /> {doc.uploadedByName ?? doc.uploadedByEmail}
                  </p>
                )}
                <div className="flex items-center justify-end gap-0.5 mt-1.5 pt-1.5 border-t border-gray-50">
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={doc.fileName}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
                      title="Download"
                    >
                      <Download size={13} />
                    </a>
                  ) : (
                    <span className="p-1.5 text-gray-200" title="URL unavailable"><Download size={13} /></span>
                  )}
                  <button
                    onClick={() => setConfirmDoc(doc)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Delete"
                  >
                    {deletingId === doc.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirm */}
      {confirmDoc && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className=" text-h3 text-header mb-2">Delete this file?</h3>
            <p className="text-body text-gray-600 mb-1"><span className="font-medium">{confirmDoc.label}</span></p>
            <p className="text-caption text-gray-400 mb-5">{confirmDoc.fileName} — this cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDoc(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-body text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDoc)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-body font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen viewer */}
      {current && (
        <div
          className="fixed inset-0 bg-black/90 z-[70] flex flex-col"
          onClick={() => setViewerIndex(null)}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 text-white/80" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="text-body font-medium truncate">{current.label}</p>
              <p className="text-caption text-white/50 truncate">
                {current.fileName} · {format(new Date(current.uploadedAt), "d MMM yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={current.url!}
                target="_blank"
                rel="noopener noreferrer"
                download={current.fileName}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Download"
              >
                <Download size={18} />
              </a>
              <button
                onClick={() => setViewerIndex(null)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center min-h-0 px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            {isPdf(current) ? (
              <iframe src={current.url!} title={current.label} className="w-full h-full rounded-lg bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url!} alt={current.label} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
          </div>

          {/* Nav arrows */}
          {viewable.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); step(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Next"
              >
                <ChevronRight size={20} />
              </button>
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-caption text-white/50 ">
                {(viewerIndex ?? 0) + 1} / {viewable.length}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
