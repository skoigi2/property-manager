"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

interface Props {
  /** Signed URLs of photos already saved with the reading. */
  urls: string[];
  /** Photos picked but not uploaded yet. */
  files?: File[];
  onRemoveFile?: (index: number) => void;
  size?: "sm" | "md";
}

/** Thumbnails of a reading's meter photos; click to view full-screen. */
export function PhotoStrip({ urls, files = [], onRemoveFile, size = "md" }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const box = size === "sm" ? "h-10 w-10" : "h-14 w-14";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setOpen(u)} className={`${box} rounded-lg overflow-hidden border border-gray-200`} aria-label={`View meter photo ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`Meter photo ${i + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
        {previews.map((u, i) => (
          <div key={u} className={`${box} relative rounded-lg overflow-hidden border border-gold/50`}>
            <button type="button" onClick={() => setOpen(u)} className="h-full w-full" aria-label={`View new photo ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`New photo ${i + 1}`} className="h-full w-full object-cover" />
            </button>
            {onRemoveFile && (
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-md p-0.5"
                aria-label={`Remove new photo ${i + 1}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Meter photo">
          <button type="button" className="absolute top-4 right-4 text-white" onClick={() => setOpen(null)} aria-label="Close photo">
            <X size={28} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="Meter photo" className="max-h-full max-w-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
