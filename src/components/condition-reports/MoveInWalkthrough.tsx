"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Camera, ChevronLeft, ChevronRight, Loader2, FileText, CheckCircle2,
  Plus, Trash2, X, Image as ImageIcon,
} from "lucide-react";
import { seedItemsFromTemplate, type ConditionReportItem } from "@/lib/condition-report-template";

type Status = "PERFECT" | "GOOD" | "FAIR" | "POOR";

type ReportType = "MOVE_IN" | "MID_TERM" | "MOVE_OUT";

interface UnitInfo {
  id: string;
  unitNumber: string;
  type: string;
  property: { id: string; name: string };
  activeTenant: { id: string; name: string } | null;
}

interface Props {
  unit: UnitInfo;
  defaultReportType?: ReportType;
}

interface PhotoState {
  /** Local id for the optimistic placeholder, replaced by server photo id once uploaded */
  localId: string;
  /** Server-side ConditionReportPhoto.id (null while uploading) */
  serverId: string | null;
  /** Object URL for thumbnail preview */
  previewUrl: string;
  /** Set when upload finishes */
  signedUrl?: string;
  /** Upload state */
  status: "uploading" | "ready" | "error";
  fileName: string;
  /** Which item this photo belongs to */
  itemId: string;
}

export function MoveInWalkthrough({ unit, defaultReportType = "MOVE_IN" }: Props) {
  const router = useRouter();

  const [reportId, setReportId] = useState<string | null>(null);
  const [reportType] = useState<ReportType>(defaultReportType);
  const [reportDate, setReportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [items, setItems] = useState<ConditionReportItem[]>(() => seedItemsFromTemplate());
  const [overallComments, setOverallComments] = useState("");
  const [signedByTenant, setSignedByTenant] = useState(false);
  const [signedByManager, setSignedByManager] = useState(false);
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const rooms = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const it of items) {
      if (!seen.has(it.room)) { seen.add(it.room); order.push(it.room); }
    }
    return order;
  }, [items]);

  const totalSteps = rooms.length + 1; // +1 for Summary
  const currentRoom = step < rooms.length ? rooms[step] : null;
  const isSummary = step >= rooms.length;

  // Items the manager has actually rated
  const completedCount = items.filter((i) => i.status !== null).length;

  const uploadingCount = photos.filter((p) => p.status === "uploading").length;

  // ── Create the draft report on mount ───────────────────────────────────────
  const created = useRef(false);
  useEffect(() => {
    if (created.current) return;
    created.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/units/${unit.id}/condition-reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportType,
            reportDate,
            tenantId: unit.activeTenant?.id ?? null,
            items,
            overallComments: "",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err?.error || "Could not start the walkthrough");
          return;
        }
        const r = await res.json();
        setReportId(r.id);
      } finally {
        setCreating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save (debounced) ──────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleSave() {
    if (!reportId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/condition-reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate,
          items,
          overallComments,
          signedByTenant,
          signedByManager,
        }),
      });
    }, 600);
  }

  useEffect(() => {
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overallComments, signedByTenant, signedByManager, reportDate, reportId]);

  // ── Item helpers ───────────────────────────────────────────────────────────
  function setItemStatus(itemId: string, status: Status) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, status } : it)));
  }
  function setItemNotes(itemId: string, notes: string) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, notes } : it)));
  }
  function removeItem(itemId: string) {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }
  function addCustomFeature(room: string, feature: string) {
    if (!feature.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: cryptoRandomId(),
        room,
        feature: feature.trim(),
        status: null,
        notes: "",
        photoIds: [],
      },
    ]);
  }
  function addCustomRoom(name: string) {
    if (!name.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: cryptoRandomId(),
        room: name.trim(),
        feature: "Walls",
        status: null,
        notes: "",
        photoIds: [],
      },
    ]);
    // step to the new room (it will be the last in the list)
    setTimeout(() => setStep(rooms.length), 0);
  }

  // ── Photo upload ───────────────────────────────────────────────────────────
  function handlePhotoCapture(itemId: string, file: File) {
    if (!reportId) {
      toast.error("Report not ready yet — try again in a moment");
      return;
    }
    const localId = cryptoRandomId();
    const previewUrl = URL.createObjectURL(file);
    setPhotos((p) => [
      ...p,
      { localId, serverId: null, previewUrl, status: "uploading", fileName: file.name, itemId },
    ]);

    const fd = new FormData();
    fd.append("file", file);

    void fetch(`/api/condition-reports/${reportId}/photos`, { method: "POST", body: fd })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "upload failed");
        }
        return res.json();
      })
      .then((data: { id: string; url: string | null }) => {
        setPhotos((prev) =>
          prev.map((p) =>
            p.localId === localId
              ? { ...p, serverId: data.id, signedUrl: data.url ?? undefined, status: "ready" }
              : p
          )
        );
        // Append to the item's photoIds
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, photoIds: [...it.photoIds, data.id] } : it
          )
        );
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
        setPhotos((prev) =>
          prev.map((p) => (p.localId === localId ? { ...p, status: "error" } : p))
        );
      });
  }

  async function deletePhoto(localId: string) {
    const target = photos.find((p) => p.localId === localId);
    if (!target) return;
    if (target.serverId && reportId) {
      await fetch(`/api/condition-reports/${reportId}/photos/${target.serverId}`, { method: "DELETE" });
    }
    setItems((prev) =>
      prev.map((it) => ({ ...it, photoIds: it.photoIds.filter((id) => id !== target.serverId) }))
    );
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  async function submitReport() {
    if (!reportId) return;
    if (uploadingCount > 0) {
      toast.error("Photos still uploading — wait a moment");
      return;
    }
    setSubmitting(true);
    try {
      // Save current state synchronously first
      await fetch(`/api/condition-reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate, items, overallComments, signedByTenant, signedByManager,
        }),
      });

      const res = await fetch(`/api/condition-reports/${reportId}/finalize`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to finalize");
        return;
      }
      toast.success("Report saved & vaulted");
      window.open(`/api/condition-reports/${reportId}/pdf`, "_blank");
      if (unit.activeTenant) {
        router.push(`/tenants/${unit.activeTenant.id}`);
      } else {
        router.push(`/properties/${unit.property.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (creating) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-gold" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / progress */}
      <Card className="!p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg text-header">
              {reportType === "MOVE_IN" ? "Move-In Walkthrough" : reportType === "MOVE_OUT" ? "Move-Out Walkthrough" : "Mid-Term Inspection"}
            </h2>
            <p className="text-sm text-gray-500 font-sans">
              Unit {unit.unitNumber}{unit.activeTenant ? ` · ${unit.activeTenant.name}` : ""}
            </p>
          </div>
          <div className="text-sm font-sans text-gray-500">
            <span className="font-mono">{completedCount}</span>
            <span className="text-gray-400"> / {items.length} rated</span>
            {uploadingCount > 0 && (
              <span className="ml-3 text-amber-600 inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> {uploadingCount} uploading
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Room tabs */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {rooms.map((r, idx) => {
            const itemsForRoom = items.filter((it) => it.room === r);
            const ratedForRoom = itemsForRoom.filter((it) => it.status !== null).length;
            const allRated = ratedForRoom === itemsForRoom.length;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setStep(idx)}
                className={`shrink-0 px-3 py-1.5 text-xs font-sans rounded-lg border transition-colors ${
                  step === idx
                    ? "border-gold bg-gold/10 text-gold-dark"
                    : allRated
                    ? "border-green-200 bg-green-50/50 text-green-700"
                    : "border-gray-200 text-gray-500 hover:border-gold/50"
                }`}
              >
                {allRated && <CheckCircle2 size={11} className="inline mr-1" />}
                {r}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setStep(rooms.length)}
            className={`shrink-0 px-3 py-1.5 text-xs font-sans rounded-lg border transition-colors ${
              step === rooms.length
                ? "border-gold bg-gold/10 text-gold-dark"
                : "border-gray-200 text-gray-500 hover:border-gold/50"
            }`}
          >
            Summary
          </button>
        </div>
      </Card>

      {/* Step body */}
      {!isSummary && currentRoom ? (
        <RoomStep
          room={currentRoom}
          items={items.filter((it) => it.room === currentRoom)}
          photos={photos}
          onStatus={setItemStatus}
          onNotes={setItemNotes}
          onRemove={removeItem}
          onPhotoCapture={handlePhotoCapture}
          onPhotoDelete={deletePhoto}
          onAddFeature={(f) => addCustomFeature(currentRoom, f)}
        />
      ) : (
        <SummaryStep
          overallComments={overallComments}
          setOverallComments={setOverallComments}
          signedByTenant={signedByTenant}
          setSignedByTenant={setSignedByTenant}
          signedByManager={signedByManager}
          setSignedByManager={setSignedByManager}
          completedCount={completedCount}
          totalCount={items.length}
          uploadingCount={uploadingCount}
          onAddRoom={addCustomRoom}
          onSubmit={submitReport}
          submitting={submitting}
          reportType={reportType}
          hasTenant={!!unit.activeTenant}
        />
      )}

      {/* Step nav */}
      <Card className="!p-3">
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft size={14} /> Prev
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
            disabled={step >= totalSteps - 1}
          >
            Next <ChevronRight size={14} />
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Room step ──────────────────────────────────────────────────────────────────

function RoomStep({
  room, items, photos,
  onStatus, onNotes, onRemove, onPhotoCapture, onPhotoDelete, onAddFeature,
}: {
  room: string;
  items: ConditionReportItem[];
  photos: PhotoState[];
  onStatus: (id: string, s: Status) => void;
  onNotes: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
  onPhotoCapture: (itemId: string, file: File) => void;
  onPhotoDelete: (localId: string) => void;
  onAddFeature: (feature: string) => void;
}) {
  const [newFeature, setNewFeature] = useState("");

  return (
    <Card>
      <h3 className="font-display text-base text-header mb-4">{room}</h3>
      <div className="space-y-4">
        {items.map((item) => {
          const itemPhotos = photos.filter((p) => p.itemId === item.id);
          return (
            <div key={item.id} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium font-sans text-header">{item.feature}</p>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="p-1 text-gray-300 hover:text-red-500"
                  title="Remove feature"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Status pills */}
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {(["PERFECT", "GOOD", "FAIR", "POOR"] as Status[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatus(item.id, s)}
                    className={`text-xs font-sans px-2 py-1.5 rounded-lg border transition-colors ${
                      item.status === s ? statusActiveClass(s) : "border-gray-200 text-gray-400 hover:border-gray-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <input
                type="text"
                placeholder="Notes (optional)"
                value={item.notes ?? ""}
                onChange={(e) => onNotes(item.id, e.target.value)}
                className="w-full mt-2 border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
              />

              {/* Photo row */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <PhotoCaptureButton onCapture={(file) => onPhotoCapture(item.id, file)} />
                {itemPhotos.map((p) => (
                  <div key={p.localId} className="relative w-14 h-14 rounded overflow-hidden border border-gray-200 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt={p.fileName} className="w-full h-full object-cover" />
                    {p.status === "uploading" && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 size={14} className="text-white animate-spin" />
                      </div>
                    )}
                    {p.status === "error" && (
                      <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center text-white text-[9px] font-sans">
                        Failed
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onPhotoDelete(p.localId)}
                      className="absolute top-0 right-0 bg-black/60 text-white rounded-bl px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Add custom feature */}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="text"
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            placeholder="Add custom feature (e.g. AC unit)"
            className="flex-1 border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { onAddFeature(newFeature); setNewFeature(""); }}
          >
            <Plus size={14} /> Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

function statusActiveClass(s: Status) {
  switch (s) {
    case "PERFECT": return "border-green-300 bg-green-50 text-green-700";
    case "GOOD":    return "border-blue-300 bg-blue-50 text-blue-700";
    case "FAIR":    return "border-amber-300 bg-amber-50 text-amber-700";
    case "POOR":    return "border-red-300 bg-red-50 text-red-700";
  }
}

// ── Photo capture button ───────────────────────────────────────────────────────

function PhotoCaptureButton({ onCapture }: { onCapture: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCapture(f);
          // Reset so picking the same file again triggers change
          if (ref.current) ref.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center justify-center w-14 h-14 border-2 border-dashed border-gray-300 rounded text-gray-400 hover:border-gold hover:text-gold transition-colors"
        title="Add photo (camera on phone)"
      >
        <Camera size={18} />
      </button>
    </>
  );
}

// ── Summary step ───────────────────────────────────────────────────────────────

function SummaryStep({
  overallComments, setOverallComments,
  signedByTenant, setSignedByTenant,
  signedByManager, setSignedByManager,
  completedCount, totalCount, uploadingCount,
  onAddRoom, onSubmit, submitting, reportType, hasTenant,
}: {
  overallComments: string;
  setOverallComments: (v: string) => void;
  signedByTenant: boolean;
  setSignedByTenant: (v: boolean) => void;
  signedByManager: boolean;
  setSignedByManager: (v: boolean) => void;
  completedCount: number;
  totalCount: number;
  uploadingCount: number;
  onAddRoom: (name: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  reportType: ReportType;
  hasTenant: boolean;
}) {
  const [newRoom, setNewRoom] = useState("");
  const blocked = uploadingCount > 0;
  const needsTenant = !hasTenant && (reportType === "MOVE_IN" || reportType === "MOVE_OUT");

  return (
    <Card>
      <h3 className="font-display text-base text-header mb-3">Summary &amp; Submit</h3>

      <div className="grid grid-cols-3 gap-3 text-sm font-sans mb-4">
        <Stat label="Items rated" value={`${completedCount}/${totalCount}`} />
        <Stat label="Pending uploads" value={String(uploadingCount)} highlight={uploadingCount > 0} />
        <Stat label="Type" value={reportType.replace("_", "-")} />
      </div>

      <label className="text-sm font-medium text-gray-600 font-sans block mb-1">Overall comments</label>
      <textarea
        rows={4}
        value={overallComments}
        onChange={(e) => setOverallComments(e.target.value)}
        placeholder="General observations, anything not captured above…"
        className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
      />

      {/* Add custom room */}
      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={newRoom}
          onChange={(e) => setNewRoom(e.target.value)}
          placeholder="Add another room (e.g. Garage)"
          className="flex-1 border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => { onAddRoom(newRoom); setNewRoom(""); }}
        >
          <Plus size={14} /> Add room
        </Button>
      </div>

      <div className="mt-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-sans text-gray-700">
          <input
            type="checkbox"
            checked={signedByTenant}
            onChange={(e) => setSignedByTenant(e.target.checked)}
          />
          Tenant has reviewed and acknowledged the condition above
        </label>
        <label className="flex items-center gap-2 text-sm font-sans text-gray-700">
          <input
            type="checkbox"
            checked={signedByManager}
            onChange={(e) => setSignedByManager(e.target.checked)}
          />
          I (manager / agent) confirm the report is accurate
        </label>
      </div>

      {needsTenant && (
        <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {reportType.replace("_", "-")} reports must be linked to a tenant. Assign a tenant on this unit before finalising.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="primary"
          onClick={onSubmit}
          loading={submitting}
          disabled={blocked || needsTenant}
        >
          <FileText size={14} /> Submit Report
        </Button>
      </div>
      {blocked && (
        <p className="mt-2 text-xs text-amber-600 font-sans text-right">
          Waiting for {uploadingCount} photo upload{uploadingCount === 1 ? "" : "s"} to finish…
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-amber-50 border border-amber-200" : "bg-cream-dark"}`}>
      <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-display mt-1 ${highlight ? "text-amber-700" : "text-header"}`}>{value}</p>
    </div>
  );
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
