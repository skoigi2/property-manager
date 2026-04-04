"use client";
import { useState } from "react";
import { FileText, Download, Trash2, Loader2, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { DOCUMENT_CATEGORIES } from "./DocumentUpload";
import { format } from "date-fns";

interface Document {
  id:          string;
  category:    string;
  label:       string;
  fileName:    string;
  fileSize:    number | null;
  mimeType:    string | null;
  uploadedAt:  string;
  url:         string | null;
}

interface Props {
  tenantId:  string;
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
  return DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function categoryColor(value: string) {
  const map: Record<string, string> = {
    LEASE_AGREEMENT: "bg-blue-100 text-blue-700",
    ID_COPY:         "bg-purple-100 text-purple-700",
    TAX_ID:          "bg-amber-100 text-amber-700",
    PAYMENT_RECEIPT: "bg-green-100 text-green-700",
    RENEWAL_NOTICE:  "bg-gold/20 text-yellow-800",
    CORRESPONDENCE:  "bg-gray-100 text-gray-600",
    OTHER:           "bg-gray-100 text-gray-500",
  };
  return map[value] ?? "bg-gray-100 text-gray-500";
}

export function DocumentList({ tenantId, documents, onDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this document permanently?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/documents/${tenantId}/${id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 gap-2 text-gray-400">
        <FileText size={28} className="opacity-30" />
        <p className="text-sm font-sans">No documents uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-cream flex items-center justify-center shrink-0">
            <FileText size={16} className="text-gold" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-sans font-medium text-header truncate">{doc.label}</p>
              <span className={clsx("text-xs px-1.5 py-0.5 rounded font-sans shrink-0", categoryColor(doc.category))}>
                {categoryLabel(doc.category)}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-sans mt-0.5">
              {doc.fileName}
              {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
              {" · "}
              {format(new Date(doc.uploadedAt), "d MMM yyyy")}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
                title="Open"
              >
                <ExternalLink size={14} />
              </a>
            ) : (
              <span className="p-1.5 rounded-lg text-gray-200 cursor-not-allowed" title="URL unavailable">
                <Download size={14} />
              </span>
            )}
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deletingId === doc.id}
              className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 transition-colors disabled:opacity-40"
              title="Delete"
            >
              {deletingId === doc.id
                ? <Loader2 size={14} className="animate-spin" />
                : <Trash2 size={14} />
              }
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
