"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { Camera, Check, LayoutGrid, List, Lock } from "lucide-react";
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

type ViewMode = "cards" | "table";
const VIEW_KEY = "gw:utilitiesReadingsView";

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
  // Table is the desk view (type a column of numbers, Enter moves down); cards
  // are the phone view. Phones always get cards — the toggle is desktop-only.
  const [view, setView] = useState<ViewMode>("table");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === "cards" || stored === "table") setView(stored);
    } catch {
      // storage blocked — keep the default
    }
  }, []);

  function changeView(v: ViewMode) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked — the choice lasts for this visit only
    }
  }

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
  const showSaveAll = pendingRows.length > 1 || (view === "table" && pendingRows.length === 1);

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
          <div className="hidden md:inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {([
              ["table", List, "Table"],
              ["cards", LayoutGrid, "Cards"],
            ] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-caption font-medium transition-colors",
                  view === v ? "bg-gold text-white" : "text-gray-500 hover:text-gray-800",
                )}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          {showSaveAll && (
            <Button size="sm" onClick={handleSaveAll} loading={savingAll}>
              Save {pendingRows.length} reading{pendingRows.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </Card>

      {groups.length === 0 && <p className="text-body text-gray-500 text-center py-8">Every meter has been read for {monthLabel}.</p>}

      {groups.map((g) => {
        const rowProps = (row: SheetRow): RowProps => ({
          row,
          draft: drafts[row.meterId],
          editable: canEdit(row),
          saving: saving === row.meterId || savingAll,
          requirePhoto: !isManager && sheet.settings[row.utility].requirePhoto,
          onValue: (v) => setDraft(row.meterId, { value: v }),
          onPhotos: (files) => addPhotos(row, files),
          onRemovePhoto: (i) =>
            setDraft(row.meterId, { photos: (drafts[row.meterId]?.photos ?? []).filter((_, idx) => idx !== i) }),
          onSave: () => handleSave(row),
        });
        const cards = (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {g.rows.map((row) => (
              <ReadingCard key={row.meterId} {...rowProps(row)} />
            ))}
          </div>
        );
        return (
          <div key={g.utility} className="space-y-2">
            <h2 className="text-h3 text-gray-900">
              {UTILITY_LABEL[g.utility]} <span className="text-caption font-normal text-gray-400">({sheet.settings[g.utility].unitLabel})</span>
            </h2>
            {view === "table" ? (
              <>
                <div className="md:hidden">{cards}</div>
                <Card padding="none" className="hidden md:block overflow-x-auto">
                  <table className="w-full table-fixed min-w-[56rem] text-body">
                    <colgroup>
                      <col className="w-[20%]" />
                      <col className="w-[17%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                      <col className="w-[11%]" />
                      <col className="w-[12%]" />
                      <col className="w-[8%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="px-4 py-2 text-label uppercase text-gray-400 font-medium">Meter</th>
                        <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Occupant</th>
                        <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Previous</th>
                        <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Current</th>
                        <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Used</th>
                        <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Photos</th>
                        <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Status</th>
                        <th className="px-4 py-2" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((row) => (
                        <ReadingTableRow key={row.meterId} {...rowProps(row)} />
                      ))}
                    </tbody>
                  </table>
                </Card>
              </>
            ) : (
              cards
            )}
          </div>
        );
      })}

      {view === "table" && showSaveAll && (
        <div className="hidden md:flex justify-end">
          <Button onClick={handleSaveAll} loading={savingAll}>
            <Check size={14} className="mr-1" />
            Save {pendingRows.length} reading{pendingRows.length === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  row: SheetRow;
  draft: Draft | undefined;
  editable: boolean;
  saving: boolean;
  requirePhoto: boolean;
  onValue: (v: string) => void;
  onPhotos: (files: FileList | null) => void;
  onRemovePhoto: (index: number) => void;
  onSave: () => void;
}

/** What a row shows, whichever view draws it. */
function rowState(row: SheetRow, draft: Draft | undefined) {
  const r = row.reading;
  const typed = draft?.value?.trim() ?? "";
  const typedNumber = typed === "" ? null : Number(typed);
  const invalid = typedNumber != null && (!Number.isFinite(typedNumber) || typedNumber < 0);
  const previous = r?.previousReading ?? row.previousReading;
  const liveConsumption =
    typedNumber != null && !invalid ? calcConsumption(previous, typedNumber) : r ? r.consumption : null;
  const negative = liveConsumption != null && liveConsumption < 0;
  const dirty = typed !== "" || (draft?.photos.length ?? 0) > 0;
  const photoCount = (r?.photoUrls.length ?? 0) + (draft?.photos.length ?? 0);
  return { r, previous, liveConsumption, negative, invalid, dirty, photoCount };
}

function StatusBadge({ row }: { row: SheetRow }) {
  const r = row.reading;
  if (row.locked) return <Badge variant="gray"><Lock size={10} className="inline mr-1" />Locked</Badge>;
  if (r?.billed) return <Badge variant="blue">Billed</Badge>;
  if (r?.status === "APPROVED") return <Badge variant="green">Approved</Badge>;
  if (r) return <Badge variant="amber">Submitted</Badge>;
  return <Badge variant="gray">Not read</Badge>;
}

/**
 * Enter / Down moves to the next meter's input and Shift+Enter / Up to the
 * previous one, across both utility tables, so a paper round sheet can be
 * typed in one pass without touching the mouse.
 */
function moveFocus(from: HTMLInputElement, step: 1 | -1) {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-reading-input]"));
  const next = inputs[inputs.indexOf(from) + step];
  if (next) {
    next.focus();
    next.select();
  }
}

function ReadingTableRow({ row, draft, editable, saving, requirePhoto, onValue, onPhotos, onRemovePhoto, onSave }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { r, previous, liveConsumption, negative, invalid, dirty, photoCount } = rowState(row, draft);

  return (
    <tr className={clsx("border-b border-gray-50 last:border-0 align-middle", negative ? "bg-expense/5" : dirty && "bg-gold/5")}>
      <td className="px-4 py-2">
        <p className="font-medium text-gray-900 truncate" title={meterTitle(row)}>{meterTitle(row)}</p>
        {row.meterNumber && <p className="text-caption text-gray-400 truncate">No. {row.meterNumber}</p>}
      </td>
      <td className="px-3 py-2 text-gray-600 truncate">
        {row.role === "UNIT" ? row.occupantName ?? <span className="text-gray-400">Vacant</span> : METER_ROLE_LABEL[row.role]}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtReading(previous)}</td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            data-reading-input
            aria-label={`Current reading, ${meterTitle(row)}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={draft?.value ?? ""}
            placeholder={r ? fmtReading(r.currentReading) : "—"}
            onChange={(e) => onValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                moveFocus(e.currentTarget, e.key === "Enter" && e.shiftKey ? -1 : 1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                moveFocus(e.currentTarget, -1);
              }
            }}
            className={clsx(
              "w-full text-body tabular-nums text-right border rounded-lg px-2 py-1 bg-cream focus:outline-none focus:ring-2 focus:ring-gold/30",
              invalid ? "border-expense" : "border-gray-200",
            )}
          />
        ) : (
          <p className="text-right tabular-nums text-gray-900">{r ? fmtReading(r.currentReading) : "—"}</p>
        )}
      </td>
      <td
        className={clsx("px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap", negative ? "text-expense" : "text-gray-900")}
        title={negative ? "Lower than the previous reading — check the number. If the meter was replaced, tell your manager." : undefined}
      >
        {liveConsumption == null ? "—" : `${fmtReading(liveConsumption)} ${row.unitLabel}`}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {(r?.photoUrls.length || draft?.photos.length) ? (
            <PhotoStrip size="sm" urls={r?.photoUrls ?? []} files={draft?.photos ?? []} onRemoveFile={editable ? onRemovePhoto : undefined} />
          ) : null}
          {editable && photoCount < 3 && (
            <>
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
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  "h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-gray-50",
                  requirePhoto && photoCount === 0 ? "border-gold text-gold-dark" : "border-gray-200 text-gray-500",
                )}
                aria-label={`Add photo, ${meterTitle(row)}${requirePhoto && photoCount === 0 ? " (required)" : ""}`}
                title={requirePhoto && photoCount === 0 ? "Photo required" : "Add photo"}
              >
                <Camera size={14} />
              </button>
            </>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <span title={row.locked ? "A later month has been read, so this month can no longer change." : undefined}>
          <StatusBadge row={row} />
        </span>
        {r?.readByName && (
          <p className="text-caption text-gray-400 mt-0.5">
            {r.readByName} · {new Date(r.readingDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </p>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editable && (
          <Button type="button" size="sm" variant={dirty ? "primary" : "secondary"} onClick={onSave} loading={saving} disabled={!dirty || saving}>
            {r ? "Update" : "Save"}
          </Button>
        )}
      </td>
    </tr>
  );
}

function ReadingCard({ row, draft, editable, saving, requirePhoto, onValue, onPhotos, onRemovePhoto, onSave }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { r, previous, liveConsumption, negative, dirty, photoCount } = rowState(row, draft);

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
        <StatusBadge row={row} />
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
