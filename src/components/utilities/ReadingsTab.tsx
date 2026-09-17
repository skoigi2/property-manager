"use client";

import { useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { Camera, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { calcConsumption, METER_ROLE_LABEL, UTILITY_LABEL, type UtilityType } from "@/lib/utility-billing";
import { maybeCompressImage } from "@/lib/image-compress";
import { fmtReading, meterTitle, readError, type ReadingSheet, type SheetRow } from "./types";
import { PhotoStrip } from "./PhotoStrip";

interface Draft {
  value: string;
  photos: File[];
}

interface Props {
  sheet: ReadingSheet;
  year: number;
  month: number;
  monthLabel: string;
  /** Session user — a caretaker may only correct their own SUBMITTED reading. */
  userId: string | null;
  isManager: boolean;
  onSaved: () => void;
}

/**
 * The month's reading sheet: every active meter with its previous reading and
 * an input for the current one, plus a camera button for a photo of the dial.
 * Used by the caretaker on a phone and by the manager at a desk. Shows units
 * only — rates and amounts live on the Review tab.
 */
export function ReadingsTab({ sheet, year, month, monthLabel, userId, isManager, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "todo">("all");

  const groups = useMemo(() => {
    const out: { utility: UtilityType; rows: SheetRow[] }[] = [];
    for (const utility of ["WATER", "ELECTRICITY"] as UtilityType[]) {
      const rows = sheet.rows.filter((r) => r.utility === utility && (filter === "all" || !r.reading));
      if (rows.length) out.push({ utility, rows });
    }
    return out;
  }, [sheet.rows, filter]);

  const total = sheet.rows.length;
  const done = sheet.rows.filter((r) => r.reading).length;

  function canEdit(row: SheetRow): boolean {
    if (row.locked) return false;
    const r = row.reading;
    if (!r) return true;
    if (r.billed) return false;
    if (isManager) return true;
    return r.status === "SUBMITTED" && r.readByUserId === userId;
  }

  function setDraft(meterId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [meterId]: { value: d[meterId]?.value ?? "", photos: d[meterId]?.photos ?? [], ...patch } }));
  }

  async function addPhotos(row: SheetRow, files: FileList | null) {
    if (!files?.length) return;
    const existing = (row.reading?.photoUrls.length ?? 0) + (drafts[row.meterId]?.photos.length ?? 0);
    const room = Math.max(0, 3 - existing);
    if (room === 0) {
      toast.error("A reading can carry at most 3 photos.");
      return;
    }
    const picked = Array.from(files).slice(0, room);
    const compressed = await Promise.all(picked.map((f) => maybeCompressImage(f)));
    setDraft(row.meterId, { photos: [...(drafts[row.meterId]?.photos ?? []), ...compressed] });
  }

  /** Returns an error message, or null on success. */
  async function saveRow(row: SheetRow): Promise<string | null> {
    const draft = drafts[row.meterId];
    const raw = draft?.value?.trim() ?? "";
    const hasValue = raw !== "";
    const hasPhotos = (draft?.photos.length ?? 0) > 0;
    if (!hasValue && !(row.reading && hasPhotos)) return "Enter the reading first.";
    const current = hasValue ? Number(raw) : row.reading!.currentReading;
    if (!Number.isFinite(current) || current < 0) return "Enter a valid number.";

    const fd = new FormData();
    if (hasValue) fd.set("currentReading", String(current));
    for (const p of draft?.photos ?? []) fd.append("photo", p);

    let res: Response;
    if (row.reading) {
      res = await fetch(`/api/utilities/readings/${row.reading.id}`, { method: "PATCH", body: fd });
    } else {
      fd.set("meterId", row.meterId);
      fd.set("periodYear", String(year));
      fd.set("periodMonth", String(month));
      // Month-end reading: dated today when entering the current month, else
      // the last day of the month being captured.
      const now = new Date();
      const sameMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
      const date = sameMonth ? now : new Date(Date.UTC(year, month, 0, 12));
      fd.set("readingDate", date.toISOString());
      res = await fetch("/api/utilities/readings", { method: "POST", body: fd });
    }
    if (!res.ok) return readError(res, "Could not save the reading.");
    setDrafts((d) => {
      const next = { ...d };
      delete next[row.meterId];
      return next;
    });
    return null;
  }

  async function handleSave(row: SheetRow) {
    setSaving(row.meterId);
    const err = await saveRow(row);
    setSaving(null);
    if (err) toast.error(err);
    else {
      toast.success(`${meterTitle(row)} saved`);
      onSaved();
    }
  }

  const pendingRows = sheet.rows.filter((r) => canEdit(r) && (drafts[r.meterId]?.value ?? "").trim() !== "");

  async function handleSaveAll() {
    setSavingAll(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of pendingRows) {
      const err = await saveRow(row);
      if (err) failures.push(`${meterTitle(row)}: ${err}`);
      else ok++;
    }
    setSavingAll(false);
    if (ok) toast.success(`${ok} reading${ok === 1 ? "" : "s"} saved`);
    if (failures.length) toast.error(failures.slice(0, 3).join("\n"), { duration: 8000 });
    onSaved();
  }

  if (total === 0) {
    return (
      <EmptyState
        title="No meters yet"
        description={
          isManager
            ? "Add the property's water and electricity meters under Meters & tariffs, then come back to enter readings."
            : "This property has no meters set up yet. Ask your manager to add them."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="text-body font-medium text-gray-900">{monthLabel} readings</p>
            <p className="text-caption text-gray-500">
              {done} of {total} meters read
            </p>
          </div>
          <div className="h-2 flex-1 min-w-[6rem] rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-gold transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(["all", "todo"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 py-1.5 text-caption font-medium transition-colors",
                  filter === f ? "bg-header text-white" : "bg-white text-gray-500 hover:bg-gray-50",
                )}
              >
                {f === "all" ? "All" : "Not read"}
              </button>
            ))}
          </div>
          {pendingRows.length > 1 && (
            <Button size="sm" onClick={handleSaveAll} loading={savingAll}>
              Save {pendingRows.length} readings
            </Button>
          )}
        </div>
      </Card>

      {groups.length === 0 && <p className="text-body text-gray-500 text-center py-8">Every meter has been read for {monthLabel}.</p>}

      {groups.map((g) => (
        <div key={g.utility} className="space-y-2">
          <h2 className="text-h3 text-gray-900">
            {UTILITY_LABEL[g.utility]} <span className="text-caption font-normal text-gray-400">({sheet.settings[g.utility].unitLabel})</span>
          </h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {g.rows.map((row) => (
              <ReadingCard
                key={row.meterId}
                row={row}
                draft={drafts[row.meterId]}
                editable={canEdit(row)}
                saving={saving === row.meterId || savingAll}
                requirePhoto={!isManager && sheet.settings[row.utility].requirePhoto}
                onValue={(v) => setDraft(row.meterId, { value: v })}
                onPhotos={(files) => addPhotos(row, files)}
                onRemovePhoto={(i) =>
                  setDraft(row.meterId, { photos: (drafts[row.meterId]?.photos ?? []).filter((_, idx) => idx !== i) })
                }
                onSave={() => handleSave(row)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadingCard({
  row, draft, editable, saving, requirePhoto, onValue, onPhotos, onRemovePhoto, onSave,
}: {
  row: SheetRow;
  draft: Draft | undefined;
  editable: boolean;
  saving: boolean;
  requirePhoto: boolean;
  onValue: (v: string) => void;
  onPhotos: (files: FileList | null) => void;
  onRemovePhoto: (index: number) => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const r = row.reading;
  const typed = draft?.value?.trim() ?? "";
  const typedNumber = typed === "" ? null : Number(typed);
  const previous = r?.previousReading ?? row.previousReading;
  const liveConsumption =
    typedNumber != null && Number.isFinite(typedNumber) ? calcConsumption(previous, typedNumber) : r ? r.consumption : null;
  const negative = liveConsumption != null && liveConsumption < 0;
  const dirty = typed !== "" || (draft?.photos.length ?? 0) > 0;
  const photoCount = (r?.photoUrls.length ?? 0) + (draft?.photos.length ?? 0);

  return (
    <Card padding="sm" className={clsx(negative && "ring-1 ring-expense/40")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body font-medium text-gray-900 truncate">{meterTitle(row)}</p>
          <p className="text-caption text-gray-500 truncate">
            {row.role === "UNIT" ? row.occupantName ?? "Vacant" : METER_ROLE_LABEL[row.role]}
            {row.meterNumber ? ` · No. ${row.meterNumber}` : ""}
          </p>
        </div>
        {row.locked ? (
          <Badge variant="gray"><Lock size={10} className="inline mr-1" />Locked</Badge>
        ) : r?.billed ? (
          <Badge variant="blue">Billed</Badge>
        ) : r?.status === "APPROVED" ? (
          <Badge variant="green">Approved</Badge>
        ) : r ? (
          <Badge variant="amber">Submitted</Badge>
        ) : (
          <Badge variant="gray">Not read</Badge>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 items-end">
        <div>
          <p className="text-label uppercase text-gray-400">Previous</p>
          <p className="text-body tabular-nums text-gray-700">{fmtReading(previous)}</p>
        </div>
        <div>
          <label className="text-label uppercase text-gray-400" htmlFor={`reading-${row.meterId}`}>Current</label>
          {editable ? (
            <input
              id={`reading-${row.meterId}`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={draft?.value ?? ""}
              placeholder={r ? fmtReading(r.currentReading) : "0"}
              onChange={(e) => onValue(e.target.value)}
              className="w-full text-body tabular-nums border border-gray-200 rounded-lg px-2 py-1.5 bg-cream focus:outline-none focus:ring-2 focus:ring-gold/30"
            />
          ) : (
            <p className="text-body tabular-nums text-gray-900">{r ? fmtReading(r.currentReading) : "—"}</p>
          )}
        </div>
        <div>
          <p className="text-label uppercase text-gray-400">Used</p>
          <p className={clsx("text-body tabular-nums font-medium", negative ? "text-expense" : "text-gray-900")}>
            {liveConsumption == null ? "—" : `${fmtReading(liveConsumption)} ${row.unitLabel}`}
          </p>
        </div>
      </div>

      {negative && (
        <p className="mt-2 text-caption text-expense">
          Lower than the previous reading — check the number. If the meter was replaced, tell your manager.
        </p>
      )}
      {row.locked && (
        <p className="mt-2 text-caption text-gray-400">A later month has been read, so this month can no longer change.</p>
      )}

      {(r?.photoUrls.length || draft?.photos.length) ? (
        <div className="mt-3">
          <PhotoStrip urls={r?.photoUrls ?? []} files={draft?.photos ?? []} onRemoveFile={editable ? onRemovePhoto : undefined} />
        </div>
      ) : null}

      {editable && (
        <div className="mt-3 flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              onPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={photoCount >= 3}
          >
            <Camera size={14} className="mr-1" />
            {photoCount ? `Photo (${photoCount}/3)` : requirePhoto ? "Photo (required)" : "Photo"}
          </Button>
          <Button type="button" size="sm" onClick={onSave} loading={saving} disabled={!dirty || saving} className="ml-auto">
            <Check size={14} className="mr-1" />
            {r ? "Update" : "Save"}
          </Button>
        </div>
      )}
      {r?.readByName && (
        <p className="mt-2 text-caption text-gray-400">
          Read by {r.readByName} on {new Date(r.readingDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </p>
      )}
    </Card>
  );
}
