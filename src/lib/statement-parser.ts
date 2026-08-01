// Client-side statement parsing for the invoice reconciliation flow
// (/invoices/reconcile). Handles three shapes: delimited exports (CSV / TSV
// with a header row), M-Pesa confirmation text blocks, and free-form lines.
// Only credits (positive amounts) become candidate lines.

export interface ParsedLine {
  id: number;
  date: string | null; // yyyy-mm-dd
  amount: number;
  description: string | null;
  reference: string | null;
}

const AMOUNT_HEADERS = ["amount", "paid in", "credit", "money in", "deposit", "value"];
const DATE_HEADERS = ["date", "completion time", "value date", "transaction date"];
const DESC_HEADERS = ["description", "details", "narrative", "particulars", "name", "detail"];
const REF_HEADERS = ["reference", "receipt", "ref", "code", "transaction id", "receipt no"];

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  // dd/mm/yy(yy) or dd-mm-yyyy
  let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(yr, Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : toIsoDay(d);
  }
  // yyyy-mm-dd
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : toIsoDay(d);
}

// Local-date ISO (toISOString would shift across midnight in +TZ locales).
function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.some((n) => h.includes(n)));
}

export function parseStatement(text: string): ParsedLine[] {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];
  const out: ParsedLine[] = [];
  let id = 0;

  // Delimited with header? (tabs, or 2+ commas on the first line, + a known amount header)
  const delim = rawLines[0].includes("\t") ? "\t" : (rawLines[0].match(/,/g) ?? []).length >= 2 ? "," : null;
  const headerCells = delim ? rawLines[0].toLowerCase().split(delim).map((c) => c.replace(/"/g, "").trim()) : [];
  const looksHeadered = delim !== null && headerIndex(headerCells, AMOUNT_HEADERS) !== -1;

  if (looksHeadered && delim) {
    const ai = headerIndex(headerCells, AMOUNT_HEADERS);
    const di = headerIndex(headerCells, DATE_HEADERS);
    const si = headerIndex(headerCells, DESC_HEADERS);
    const ri = headerIndex(headerCells, REF_HEADERS);
    for (const line of rawLines.slice(1)) {
      const cells = line.split(delim).map((c) => c.replace(/^"|"$/g, "").trim());
      const amount = parseAmount(cells[ai] ?? "");
      if (!amount || amount <= 0) continue;
      out.push({
        id: id++,
        amount,
        date: di !== -1 ? normalizeDate(cells[di] ?? "") : null,
        description: si !== -1 ? cells[si] || null : cells.filter((_, i) => i !== ai).join(" ") || null,
        reference: ri !== -1 ? cells[ri] || null : null,
      });
    }
    return out;
  }

  // M-Pesa confirmation lines / free-form text
  for (const line of rawLines) {
    const mpesaAmt = line.match(/(?:ksh?s?|kes)\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
    const generic = line.match(/([\d,]+\.\d{2})/);
    const amount = parseAmount(mpesaAmt?.[1] ?? generic?.[1] ?? "");
    if (!amount || amount <= 0) continue;
    const code = line.match(/^([A-Z0-9]{9,12})\b/)?.[1] ?? null;
    const from = line.match(/(?:received from|from)\s+([A-Za-z][A-Za-z .'-]+?)(?=\s+\d|\s+on\b|[.,]|$)/i)?.[1]?.trim() ?? null;
    const on = line.match(/\bon\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i)?.[1] ?? null;
    out.push({
      id: id++,
      amount,
      date: on ? normalizeDate(on) : null,
      description: from ?? line.slice(0, 120),
      reference: code,
    });
  }
  return out;
}
