"use client";
import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { clsx } from "clsx";

export const DOCUMENT_CATEGORIES = [
  { value: "LEASE_AGREEMENT", label: "Lease Agreement" },
  { value: "ID_COPY",         label: "ID / Passport Copy" },
  { value: "TAX_ID",          label: "Tax ID Certificate" },
  { value: "PAYMENT_RECEIPT", label: "Payment Receipt" },
  { value: "RENEWAL_NOTICE",  label: "Renewal Notice" },
  { value: "CORRESPONDENCE",  label: "Correspondence" },
  { value: "OTHER",           label: "Other" },
] as const;

interface Props {
  tenantId: string;
  onUploaded: () => void;
}

export function DocumentUpload({ tenantId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [category, setCategory] = useState("LEASE_AGREEMENT");
  const [label, setLabel]       = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState(false);

  function handleFile(f: File) {
    setFile(f);
    setLabel(f.name.replace(/\.[^/.]+$/, "").replace(/_/g, " "));
    setError(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function submit(): Promise<void> {
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    fd.append("label", label || file.name);

    try {
      const res = await fetch(`/api/documents/${tenantId}`, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Upload failed");
      }
      setFile(null);
      setLabel("");
      onUploaded();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
          dragOver ? "border-gold bg-gold/5" : "border-gray-200 hover:border-gold/50 hover:bg-cream"
        )}
      >
        <Upload size={22} className="text-gray-400" />
        <p className="text-sm text-gray-500 font-sans">
          {file ? (
            <span className="text-header font-medium">{file.name}</span>
          ) : (
            <>Drop a file here or <span className="text-gold font-medium">browse</span></>
          )}
        </p>
        <p className="text-xs text-gray-400 font-sans">PDF, JPEG, PNG, DOCX · max 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {file && (
        <div className="flex gap-2 flex-wrap">
          {/* Category select */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 min-w-[150px] border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-gold/40"
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Label input */}
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 min-w-[150px] border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans text-gray-700 focus:outline-none focus:ring-2 focus:ring-gold/40"
          />

          {/* Remove file */}
          <button
            onClick={() => setFile(null)}
            className="p-2 text-gray-400 hover:text-expense rounded-lg transition-colors"
            title="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-expense font-sans">{error}</p>
      )}

      {file && (
        <button
          onClick={submit}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-white text-sm font-sans font-medium rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Uploading…" : "Upload document"}
        </button>
      )}
    </div>
  );
}
