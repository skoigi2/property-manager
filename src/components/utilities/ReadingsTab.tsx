"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { Camera, Check, CloudOff, DoorOpen, Download, Layers, LayoutGrid, List, Lock, Upload, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { calcConsumption, METER_ROLE_LABEL, photoReadingMismatch, UTILITY_LABEL, type UtilityType } from "@/lib/utility-billing";
import { maybeCompressImage } from "@/lib/image-compress";
import { defaultReadingDate } from "@/lib/utility-readings-import";
import {
  flushQueued,
  isOfflineError,
  listQueued,
  queueKey,
  queueReading,
  removeQueued,
  type QueuedReading,
} from "@/lib/offline-readings";
import { byUnitOrder, fmtReading, meterTitle, readError, type ReadingSheet, type SheetRow } from "./types";
import { PhotoStrip } from "./PhotoStrip";
import { ReadingsImportDialog, downloadReadingSheet } from "./ReadingsImport";

interface Draft {
  value: string;
  photos: File[];
}

/** saveRow's answer when there is no connection and the reading was kept on the phone. */
const QUEUED = "__queued__";

type ViewMode = "cards" | "table";
type Grouping = "utility" | "unit";
const VIEW_KEY = "gw:utilitiesReadingsView";
const GROUP_KEY = "gw:utilitiesReadingsGroup";

interface Group {
  key: string;
  title: string;
  subtitle: string | null;
  rows: SheetRow[];
}

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : null;
  } catch {
    return null; // storage blocked
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked — the choice lasts for this visit only
  }
}

interface Props {
  sheet: ReadingSheet;
  propertyId: string;
  propertyName: string;
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
export function ReadingsTab({ sheet, propertyId, propertyName, year, month, monthLabel, userId, isManager, onSaved }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "todo">("all");
  // Table is the desk view (type a column of numbers, Enter moves down); cards
  // are the phone view. Phones always get cards — the toggle is desktop-only.
  const [view, setView] = useState<ViewMode>("table");
  // By unit follows the caretaker's walk: each door's water, hot water and
  // power together, the shared KPLC / common-area meters last.
  const [grouping, setGrouping] = useState<Grouping>("utility");
  const [importOpen, setImportOpen] = useState(false);
  // Readings saved with no signal, waiting on this phone to be sent.
  const [queued, setQueued] = useState<QueuedReading[]>([]);
  const [sendingQueued, setSendingQueued] = useState(false);

  const reloadQueue = useCallback(() => listQueued(propertyId).then(setQueued), [propertyId]);

  const sendQueued = useCallback(
    async (manual: boolean) => {
      setSendingQueued(true);
      try {
        const r = await flushQueued(propertyId);
        await reloadQueue();
        if (r.sent) {
          toast.success(`${r.sent} reading${r.sent === 1 ? "" : "s"} sent from this phone`);
          onSaved();
        }
        if (r.failed.length) toast.error(r.failed.map((f) => `${f.meterTitle}: ${f.error}`).slice(0, 3).join("\n"), { duration: 10000 });
        if (manual && r.offline) toast.error("Still no connection — the readings stay on this phone.");
      } finally {
        setSendingQueued(false);
      }
    },
    [propertyId, reloadQueue, onSaved],
  );

  useEffect(() => {
    void reloadQueue().then(() => {
      if (typeof navigator === "undefined" || navigator.onLine) void sendQueued(false);
    });
    const onOnline = () => void sendQueued(false);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reloadQueue, sendQueued]);

  useEffect(() => {
    const v = readStored(VIEW_KEY, ["cards", "table"] as const);
    if (v) setView(v);
    const g = readStored(GROUP_KEY, ["utility", "unit"] as const);
    if (g) setGrouping(g);
  }, []);

  function changeView(v: ViewMode) {
    setView(v);
    store(VIEW_KEY, v);
  }

  function changeGrouping(g: Grouping) {
    setGrouping(g);
    store(GROUP_KEY, g);
  }

  const groups = useMemo((): Group[] => {
    const visible = sheet.rows.filter((r) => filter === "all" || !r.reading);
    if (grouping === "utility") {
      return (["WATER", "ELECTRICITY"] as UtilityType[])
        .map((utility) => ({
          key: utility,
          title: UTILITY_LABEL[utility],
          subtitle: `(${sheet.settings[utility].unitLabel})`,
          rows: visible.filter((r) => r.utility === utility),
        }))
        .filter((g) => g.rows.length > 0);
    }
    const out: Group[] = [];
    for (const row of byUnitOrder(visible)) {
      const key = row.role === "UNIT" ? row.unitId ?? row.meterId : "shared";
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = row.role === "UNIT"
          ? { key, title: `Unit ${row.unitNumber ?? "—"}`, subtitle: row.occupantName ?? "Vacant", rows: [] }
          : { key, title: "Shared meters", subtitle: "KPLC bulk and common areas, not billed to tenants", rows: [] };
        out.push(g);
      }
      g.rows.push(row);
    }
    return out;
  }, [sheet.rows, sheet.settings, filter, grouping]);

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
    const readingDate = defaultReadingDate(year, month).toISOString();

    let res: Response;
    try {
      if (row.reading) {
        res = await fetch(`/api/utilities/readings/${row.reading.id}`, { method: "PATCH", body: fd });
      } else {
        fd.set("meterId", row.meterId);
        fd.set("periodYear", String(year));
        fd.set("periodMonth", String(month));
        fd.set("readingDate", readingDate);
        res = await fetch("/api/utilities/readings", { method: "POST", body: fd });
      }
    } catch (e) {
      if (!isOfflineError(e)) return "Could not save the reading.";
      try {
        await queueReading({
          key: queueKey(row.meterId, year, month),
          propertyId,
          meterId: row.meterId,
          meterTitle: meterTitle(row),
          periodYear: year,
          periodMonth: month,
          readingDate,
          currentReading: hasValue ? current : null,
          readingId: row.reading?.id ?? null,
          photos: draft?.photos ?? [],
          queuedAt: new Date().toISOString(),
        });
      } catch {
        return "No connection, and this phone can't store the reading. Try again when you have signal.";
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.meterId];
        return next;
      });
      await reloadQueue();
      return QUEUED;
    }
    if (!res.ok) return readError(res, "Could not save the reading.");
    const saved = (await res.json().catch(() => null)) as { photoMismatch?: boolean; photoReading?: number | null; currentReading?: number } | null;
    if (saved?.photoMismatch && saved.photoReading != null && saved.currentReading != null) {
      toast.error(
        `${meterTitle(row)}: the photo reads ${fmtReading(saved.photoReading)}, but ${fmtReading(saved.currentReading)} was saved. Check the dial and correct it if needed.`,
        { duration: 12000 },
      );
    }
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
    if (err === QUEUED) {
      toast("No signal — saved on this phone. It sends by itself when you're back online.", { icon: "📶", duration: 6000 });
    } else if (err) toast.error(err);
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
    let kept = 0;
    const failures: string[] = [];
    for (const row of pendingRows) {
      const err = await saveRow(row);
      if (err === QUEUED) kept++;
      else if (err) failures.push(`${meterTitle(row)}: ${err}`);
      else ok++;
    }
    setSavingAll(false);
    if (ok) toast.success(`${ok} reading${ok === 1 ? "" : "s"} saved`);
    if (kept) toast(`No signal — ${kept} reading${kept === 1 ? "" : "s"} saved on this phone, sent once you're back online.`, { icon: "📶", duration: 6000 });
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

  const rowProps = (row: SheetRow): RowProps => ({
    queued: queued.find((q) => q.key === queueKey(row.meterId, year, month)),
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

  const heading = (g: Group) => (
    <h2 className="text-h3 text-gray-900">
      {g.title} {g.subtitle && <span className="text-caption font-normal text-gray-400">{g.subtitle}</span>}
    </h2>
  );

  const cardSections = (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key} className="space-y-2">
          {heading(g)}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {g.rows.map((row) => (
              <ReadingCard key={row.meterId} {...rowProps(row)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

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
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <Segmented
            label="Group readings"
            value={grouping}
            onChange={changeGrouping}
            options={[
              { value: "utility", label: "By utility", icon: Layers },
              { value: "unit", label: "By unit", icon: DoorOpen },
            ]}
          />
          <Segmented
            label="Layout"
            className="hidden md:inline-flex"
            value={view}
            onChange={changeView}
            options={[
              { value: "table", label: "Table", icon: List },
              { value: "cards", label: "Cards", icon: LayoutGrid },
            ]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => downloadReadingSheet(sheet, year, month, propertyName)}>
              <Download size={14} className="mr-1" /> Download sheet
            </Button>
            {isManager && (
              <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={14} className="mr-1" /> Import readings
              </Button>
            )}
            {showSaveAll && (
              <Button size="sm" onClick={handleSaveAll} loading={savingAll}>
                Save {pendingRows.length} reading{pendingRows.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {queued.length > 0 && (
        <Card padding="sm" className="border border-amber-200 bg-amber-50/60">
          <div className="flex flex-wrap items-center gap-3">
            <CloudOff size={16} className="text-amber-700 shrink-0" />
            <p className="text-body text-amber-900 flex-1 min-w-[12rem]">
              {queued.length} reading{queued.length === 1 ? "" : "s"} saved on this phone, waiting for signal. They send by themselves once
              you&apos;re back online.
            </p>
            <Button size="sm" variant="secondary" onClick={() => sendQueued(true)} loading={sendingQueued}>
              Send now
            </Button>
          </div>
          {queued.some((q) => q.lastError) && (
            <ul className="mt-2 space-y-1">
              {queued
                .filter((q) => q.lastError)
                .map((q) => (
                  <li key={q.key} className="flex flex-wrap items-center gap-2 text-caption text-expense">
                    <span className="flex-1 min-w-[12rem]">
                      {q.meterTitle}: {q.lastError}
                    </span>
                    <button
                      type="button"
                      className="underline text-gray-600 hover:text-gray-900"
                      onClick={async () => {
                        await removeQueued(q.key);
                        await reloadQueue();
                      }}
                    >
                      Discard
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {isManager && (
        <ReadingsImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          sheet={sheet}
          propertyId={propertyId}
          propertyName={propertyName}
          year={year}
          month={month}
          monthLabel={monthLabel}
          onImported={onSaved}
        />
      )}

      {groups.length === 0 && <p className="text-body text-gray-500 text-center py-8">Every meter has been read for {monthLabel}.</p>}

      {groups.length > 0 && view === "cards" && cardSections}

      {groups.length > 0 && view === "table" && (
        <>
          <div className="md:hidden">{cardSections}</div>
          <div className="hidden md:block space-y-4">
            {grouping === "unit" ? (
              // One table, a header row per unit: Enter walks the building door to door.
              <ReadingsTable groups={groups} byUnit rowProps={rowProps} />
            ) : (
              groups.map((g) => (
                <div key={g.key} className="space-y-2">
                  {heading(g)}
                  <ReadingsTable groups={[g]} byUnit={false} rowProps={rowProps} />
                </div>
              ))
            )}
          </div>
        </>
      )}

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

function Segmented<T extends string>({
  label, value, options, onChange, className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: LucideIcon }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={clsx("inline-flex rounded-lg border border-gray-200 bg-white p-0.5", className)}>
      {options.map(({ value: v, label: text, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1 rounded-md text-caption font-medium transition-colors",
            value === v ? "bg-gold text-white" : "text-gray-500 hover:text-gray-800",
          )}
        >
          <Icon size={14} /> {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Desktop table. Grouped by utility it is one table per utility; grouped by
 * unit it is one table with a header row per unit, the second column shows
 * the utility instead of the (repeated) occupant, and the meter column shows
 * just the meter's name. Fixed column widths so separate tables line up.
 */
function ReadingsTable({ groups, byUnit, rowProps }: { groups: Group[]; byUnit: boolean; rowProps: (row: SheetRow) => RowProps }) {
  return (
    <Card padding="none" className="overflow-x-auto">
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
            <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">{byUnit ? "Utility" : "Occupant"}</th>
            <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Previous</th>
            <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Current</th>
            <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Used</th>
            <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Photos</th>
            <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Status</th>
            <th className="px-4 py-2" aria-label="Actions" />
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            {byUnit && (
              <tr className="bg-cream/70 border-b border-gray-100">
                <th colSpan={8} scope="rowgroup" className="px-4 py-1.5 text-left font-medium text-gray-900">
                  {g.title} <span className="text-caption font-normal text-gray-500">· {g.subtitle}</span>
                </th>
              </tr>
            )}
            {g.rows.map((row) => (
              <ReadingTableRow key={row.meterId} {...rowProps(row)} byUnit={byUnit} />
            ))}
          </tbody>
        ))}
      </table>
    </Card>
  );
}

interface RowProps {
  /** A reading of this meter kept on the phone, waiting for signal. */
  queued?: QueuedReading;
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
  const photoCheck: "mismatch" | "match" | "unreadable" | null =
    r?.photoReading != null
      ? photoReadingMismatch(r.currentReading, r.photoReading) ? "mismatch" : "match"
      : r?.photoReadingNote ? "unreadable" : null;
  return { r, previous, liveConsumption, negative, invalid, dirty, photoCount, photoCheck };
}

/** Under a row whose reading is kept on the phone: what will be sent. */
function QueuedNote({ queued, unitLabel }: { queued?: QueuedReading; unitLabel: string }) {
  if (!queued) return null;
  const photos = queued.photos.length ? ` + ${queued.photos.length} photo${queued.photos.length === 1 ? "" : "s"}` : "";
  return (
    <p className="text-caption text-amber-700 mt-0.5">
      Waiting to send{queued.currentReading !== null ? `: ${fmtReading(queued.currentReading)} ${unitLabel}` : ""}{photos}
    </p>
  );
}

/** One line under a saved reading: what the photo check found. */
function PhotoCheckNote({ r, check, compact = false }: { r: SheetRow["reading"]; check: ReturnType<typeof rowState>["photoCheck"]; compact?: boolean }) {
  if (!r || !check) return null;
  if (check === "match") {
    return <p className="text-caption text-income mt-0.5">✓ Matches the photo</p>;
  }
  if (check === "unreadable") {
    return compact ? null : <p className="text-caption text-gray-400 mt-0.5">Photo couldn&apos;t be read automatically</p>;
  }
  return (
    <p className="text-caption text-amber-700 mt-0.5" title={r.photoReadingNote ?? undefined}>
      Photo reads {fmtReading(r.photoReading!)}{compact ? "" : " — check the number typed"}
    </p>
  );
}

function StatusBadge({ row, queued }: { row: SheetRow; queued?: QueuedReading }) {
  if (queued) return <Badge variant="amber"><CloudOff size={10} className="inline mr-1" />On this phone</Badge>;
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

function ReadingTableRow({ row, draft, editable, saving, requirePhoto, onValue, onPhotos, onRemovePhoto, onSave, queued, byUnit = false }: RowProps & { byUnit?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { r, previous, liveConsumption, negative, invalid, dirty, photoCount, photoCheck } = rowState(row, draft);

  return (
    <tr className={clsx("border-b border-gray-50 last:border-0 align-middle", negative ? "bg-expense/5" : dirty && "bg-gold/5")}>
      <td className="px-4 py-2">
        <p className="font-medium text-gray-900 truncate" title={meterTitle(row)}>{byUnit && row.role === "UNIT" ? row.label : meterTitle(row)}</p>
        {row.meterNumber && <p className="text-caption text-gray-400 truncate">No. {row.meterNumber}</p>}
      </td>
      <td className="px-3 py-2 text-gray-600 truncate">
        {byUnit
          ? UTILITY_LABEL[row.utility]
          : row.role === "UNIT"
            ? row.occupantName ?? <span className="text-gray-400">Vacant</span>
            : METER_ROLE_LABEL[row.role]}
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
          <StatusBadge row={row} queued={queued} />
        </span>
        <QueuedNote queued={queued} unitLabel={row.unitLabel} />
        {r?.readByName && (
          <p className="text-caption text-gray-400 mt-0.5">
            {r.readByName} · {new Date(r.readingDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </p>
        )}
        <PhotoCheckNote r={r} check={photoCheck} compact />
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

function ReadingCard({ row, draft, editable, saving, requirePhoto, onValue, onPhotos, onRemovePhoto, onSave, queued }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { r, previous, liveConsumption, negative, dirty, photoCount, photoCheck } = rowState(row, draft);

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
        <StatusBadge row={row} queued={queued} />
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
      <div className="mt-1">
        <QueuedNote queued={queued} unitLabel={row.unitLabel} />
        <PhotoCheckNote r={r} check={photoCheck} />
      </div>

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
