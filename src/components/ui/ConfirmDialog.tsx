"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  /**
   * Extra guard for catastrophic actions: the user must type this exact phrase
   * (e.g. "DELETE") before the confirm button enables.
   */
  typeToConfirm?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  loading = false,
  typeToConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  // Reset the guard every time the dialog opens.
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const blocked = !!typeToConfirm && typed !== typeToConfirm;

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-body text-gray-600 mb-4">{message}</p>
      {typeToConfirm && (
        <div className="mb-5">
          <label className="block text-caption text-gray-500 mb-1.5">
            Type <span className="font-mono font-semibold text-red-600">{typeToConfirm}</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-body font-mono focus:outline-none focus:ring-2 focus:ring-red-200"
          />
        </div>
      )}
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading} disabled={blocked}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
