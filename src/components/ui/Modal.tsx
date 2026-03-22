"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={clsx(
        "w-full rounded-2xl shadow-xl bg-white p-0 backdrop:bg-black/40 m-auto",
        sizes[size]
      )}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-display text-lg text-header">{title}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-cream-dark transition-colors text-gray-400 hover:text-header"
        >
          <X size={18} />
        </button>
      </div>
      {/* Body */}
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
