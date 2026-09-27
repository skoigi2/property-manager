"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { METER_ROLE_LABEL, UTILITY_LABEL } from "@/lib/utility-billing";
import {
  MAX_IMPORT_ROWS,
  READING_SHEET_COLUMNS,
  matchReadingRows,
  periodCell,
  resolveHeaders,
  sheetDateCell,
  summariseImport,
  type ImportRowResult,
} from "@/lib/utility-readings-import";
import { byUnitOrder, fmtReading, readError, type ReadingSheet } from "./types";

/**
 * The month's round sheet as Excel, in door-to-door order: every active meter
 * with its previous reading and a blank (or the saved) current reading. The
 * caretaker can print it and walk the building; the manager types the numbers
 * in and imports the same file back.
 */
export function downloadReadingSheet(sheet: ReadingSheet, year: number, month: number, propertyName: string) {
  const rows = byUnitOrder(sheet.rows).map((r) => ({
    Period: periodCell(year, month),
    Unit: r.unitNumber ?? "",
    Meter: r.label,
    Utility: UTILITY_LABEL[r.utility],
    "Meter No.": r.meterNumber ?? "",
    Occupant: r.role === "UNIT" ? r.occupantName ?? "Vacant" : METER_ROLE_LABEL[r.role],
    "Previous reading": r.reading?.previousReading ?? r.previousReading,
    "Current reading": r.reading ? r.reading.currentReading : "",
    "Reading date": r.reading ? sheetDateCell(r.reading.readingDate) : "",
    Notes: r.reading?.notes ?? "",
    "Meter ID": r.meterId,
  }));
  const columns = [...READING_SHEET_COLUMNS];
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => columns.map((c) => r[c]))]);
  ws["!cols"] = columns.map((c) => ({
    wch: c === "Meter ID" ? 28 : c === "Occupant" || c === "Notes" ? 24 : c === "Unit" || c === "Period" ? 9 : 15,
  }));

  const help = XLSX.utils.aoa_to_sheet([
    ["How to use this sheet"],
    [],
    ["1.", "Write each meter's reading in the Current reading column. Leave it blank for a meter you did not read."],
    ["2.", "Reading date is optional (e.g. 30/09/2026). Blank = the month-end date."],
    ["3.", "Don't change Period or Meter ID — they tell the import which meter and month a row belongs to."],
    ["4.", "On the Utilities page, open Readings, pick the same month and use Import readings."],
    ["5.", "Imported readings wait on Review & bill for approval, like readings typed in the app."],
  ]);
  help["!cols"] = [{ wch: 4 }, { wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Readings");
  XLSX.utils.book_append_sheet(wb, help, "How to use");
  const safeName = propertyName.replace(/[\\/:*?"<>|]/g, "").trim() || "Property";
  XLSX.writeFile(wb, `Meter readings - ${safeName} - ${periodCell(year, month)}.xlsx`);
}

interface ImportOutcome {
  created: number;
  updated: number;
  unchanged: number;
  failed: { rowNumber: number; error: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  sheet: ReadingSheet;
  propertyId: string;
  propertyName: string;
  year: number;
  month: number;
  monthLabel: string;
  onImported: () => void;
}

const ACTION_BADGE: Record<ImportRowResult["action"], { variant: "green" | "blue" | "gray" | "red"; label: string }> = {
  create: { variant: "green", label: "New" },
  update: { variant: "blue", label: "Update" },
  unchanged: { variant: "gray", label: "Unchanged" },
  blank: { variant: "gray", label: "Blank" },
  error: { variant: "red", label: "Can't import" },
};

/** Upload the filled sheet → row-by-row preview → import. */
export function ReadingsImportDialog({ open, onClose, sheet, propertyId, propertyName, year, month, monthLabel, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  function reset() {
    setFileName(null);
    setResults(null);
    setParseError(null);
    setOutcome(null);
  }

  function close() {
    if (importing) return;
    if (outcome && outcome.created + outcome.updated > 0) onImported();
    reset();
    onClose();
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
      if (rows.length === 0) return setParseError("The first sheet of this file is empty.");
      if (rows.length > MAX_IMPORT_ROWS) return setParseError(`The file has ${rows.length} rows — import at most ${MAX_IMPORT_ROWS} at a time.`);
      const headers = resolveHeaders(Object.keys(rows[0]));
      if (!headers.current) {
        return setParseError('No "Current reading" column found. Use Download sheet to start from the right layout.');
      }
      setResults(matchReadingRows(rows, sheet.rows, { year, month }));
    } catch {
      setParseError("Couldn't read that file. Save it as .xlsx (or .csv) and try again.");
    }
  }

  const toImport = (results ?? []).filter((r) => r.action === "create" || r.action === "update");
  const summary = results ? summariseImport(results) : null;
  const shown = (results ?? []).filter((r) => r.action !== "blank");

  async function runImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/utilities/readings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          periodYear: year,
          periodMonth: month,
          rows: toImport.map((r) => ({
            rowNumber: r.rowNumber,
            meterId: r.meterId,
            currentReading: r.currentReading,
            ...(r.readingDate ? { readingDate: r.readingDate } : {}),
            ...(r.notes ? { notes: r.notes } : {}),
          })),
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "The import failed."));
        return;
      }
      const body: ImportOutcome = await res.json();
      setOutcome(body);
      const saved = body.created + body.updated;
      if (saved) toast.success(`${saved} reading${saved === 1 ? "" : "s"} imported`);
      if (body.failed.length) toast.error(`${body.failed.length} row${body.failed.length === 1 ? "" : "s"} could not be imported`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={`Import ${monthLabel} readings`} size="3xl">
      <div className="space-y-4">
        {!results && !parseError && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-cream/60 p-6 text-center space-y-3">
            <FileSpreadsheet className="mx-auto text-gray-400" size={28} />
            <p className="text-body text-gray-700">
              Upload the readings sheet for <span className="font-medium">{propertyName}</span>, {monthLabel}.
            </p>
            <p className="text-caption text-gray-500">
              Start from <span className="font-medium">Download sheet</span> so every row carries its Meter ID. Other layouts work when
              they have a Current reading column and a Meter No., or Unit and Meter.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => downloadReadingSheet(sheet, year, month, propertyName)}>
                Download sheet
              </Button>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <Upload size={14} className="mr-1" /> Choose file
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {parseError && (
          <div className="rounded-lg bg-expense/5 border border-expense/20 p-3 flex items-start justify-between gap-3">
            <p className="text-body text-expense">{parseError}</p>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Choose another file</Button>
          </div>
        )}

        {results && summary && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-caption text-gray-500 mr-auto truncate">{fileName}</p>
              {summary.create > 0 && <Badge variant="green">{summary.create} new</Badge>}
              {summary.update > 0 && <Badge variant="blue">{summary.update} update{summary.update === 1 ? "" : "s"}</Badge>}
              {summary.unchanged > 0 && <Badge variant="gray">{summary.unchanged} unchanged</Badge>}
              {summary.blank > 0 && <Badge variant="gray">{summary.blank} blank</Badge>}
              {summary.error > 0 && <Badge variant="red">{summary.error} can&apos;t import</Badge>}
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-lg border border-gray-100">
              <table className="w-full text-body">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Row</th>
                    <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Meter</th>
                    <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Previous</th>
                    <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Current</th>
                    <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium text-right">Used</th>
                    <th className="px-3 py-2 text-label uppercase text-gray-400 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const failed = outcome?.failed.find((f) => f.rowNumber === r.rowNumber);
                    const badge = failed ? ACTION_BADGE.error : ACTION_BADGE[r.action];
                    const message = failed?.error ?? r.error ?? r.warning;
                    return (
                      <tr key={r.rowNumber} className={clsx("border-b border-gray-50 last:border-0 align-top", (r.action === "error" || failed) && "bg-expense/5")}>
                        <td className="px-3 py-2 tabular-nums text-gray-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 text-gray-900">{r.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.previousReading == null ? "—" : fmtReading(r.previousReading)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.currentReading == null ? "—" : fmtReading(r.currentReading)}</td>
                        <td className={clsx("px-3 py-2 text-right tabular-nums", (r.consumption ?? 0) < 0 ? "text-expense" : "text-gray-900")}>
                          {r.consumption == null ? "—" : fmtReading(r.consumption)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={badge.variant}>{outcome && !failed && (r.action === "create" || r.action === "update") ? "Imported" : badge.label}</Badge>
                          {message && (
                            <p className={clsx("text-caption mt-0.5", failed || r.action === "error" ? "text-expense" : "text-amber-700")}>{message}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Every row is blank — there is nothing to import.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {outcome ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body text-gray-700">
                  {outcome.created} new, {outcome.updated} updated
                  {outcome.failed.length ? `, ${outcome.failed.length} failed` : ""}. Approve them on Review &amp; bill.
                </p>
                <Button onClick={close}>Done</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-gray-500">
                  Imported readings wait on Review &amp; bill for approval.
                  {summary.error > 0 ? " Rows that can't be imported are skipped." : ""}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
                    Choose another file
                  </Button>
                  <Button onClick={runImport} loading={importing} disabled={toImport.length === 0 || importing}>
                    Import {toImport.length} reading{toImport.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
