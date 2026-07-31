"use client";
import { useState } from "react";
import toast from "react-hot-toast";

/**
 * Inline lease-end quick fix for "Lease date TBC" rows — the one lease action
 * atomic enough to complete without leaving the page. Saves via the tenant
 * PATCH and reports the new date back so the caller can update its list.
 * Used by the tenants-page lease banner and the dashboard AlertsPanel.
 */
export function TbcDateFix({ tenantId, onSaved }: { tenantId: string; onSaved: (leaseEnd: string) => void }) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!date) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaseEnd: date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to save lease end date");
      }
      toast.success("Lease end date set");
      onSaved(date);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save lease end date");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="border border-amber-200 bg-white rounded-lg px-2 py-1 text-caption text-header focus:outline-none focus:ring-2 focus:ring-gold/40"
        aria-label="Lease end date"
      />
      <button
        disabled={saving || !date}
        onClick={save}
        className="text-caption font-medium text-white bg-gold hover:bg-gold-dark px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {saving ? "Saving…" : "Set date"}
      </button>
    </span>
  );
}
