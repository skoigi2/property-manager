"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { formatCurrency } from "@/lib/currency";
import { maybeCompressImage } from "@/lib/image-compress";
import { buildWhatsAppLink, dialCodeForCurrency, normalizePhoneForWhatsApp } from "@/lib/whatsapp";
import { QUOTE_STATUS_LABEL, lowestQuote, type QuoteStatus } from "@/lib/quote-rules";
import { Check, Copy, FileText, Paperclip, Plus, Send, Undo2, X } from "lucide-react";

// Quotes on a maintenance job: ask several vendors (one link each), type in a
// quote received by phone, compare, and — managers only — accept one.

interface QuoteDto {
  id: string;
  status: QuoteStatus;
  vendor: { id: string; name: string; phone: string | null; category: string; hasEmail: boolean };
  amount: number | null;
  note: string | null;
  availableDate: string | null;
  document: { name: string; mime: string | null; url: string | null } | null;
  requestedByName: string | null;
  requestedAt: string;
  receivedAt: string | null;
  receivedVia: string | null;
  decidedByName: string | null;
  declineReason: string | null;
  linkState: "open" | "expired" | "closed" | "decided";
  linkUrl: string | null;
  needsOwnerApproval: boolean;
}

interface QuotesDto {
  jobId: string;
  jobStatus: string;
  jobTitle: string;
  currency: string;
  repairAuthorityLimit: number | null;
  propertyName: string;
  unitNumber: string | null;
  quotes: QuoteDto[];
  viewer: { isManager: boolean };
}

interface VendorOption { id: string; name: string; category: string; phone?: string | null; isActive: boolean }

const STATUS_BADGE: Record<QuoteStatus, "gray" | "blue" | "green" | "red"> = {
  REQUESTED: "gray", RECEIVED: "blue", ACCEPTED: "green", DECLINED: "red",
};

async function readError(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : fallback;
}

export function QuotesModal({ jobId, onClose }: { jobId: string; onClose: (changed: boolean) => void }) {
  const [data, setData] = useState<QuotesDto | null>(null);
  const [changed, setChanged] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/maintenance/${jobId}/quotes`);
    if (!res.ok) { toast.error(await readError(res, "Couldn't load the quotes")); return; }
    setData(await res.json());
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const apply = (next: QuotesDto) => { setData(next); setChanged(true); };
  const open = data ? data.jobStatus !== "DONE" && data.jobStatus !== "CANCELLED" : false;
  const lowest = useMemo(() => (data ? lowestQuote(data.quotes) : null), [data]);

  async function act(q: QuoteDto, action: string, body: Record<string, unknown> = {}, ok?: string) {
    setBusy(`${action}:${q.id}`);
    try {
      const res = await fetch(`/api/maintenance/${jobId}/quotes/${q.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't save that")); return false; }
      const json = await res.json();
      apply(json);
      if (action === "resend" && json.url) {
        try { await navigator.clipboard.writeText(json.url); } catch { /* clipboard blocked */ }
        toast.success(json.emailed ? "New link emailed to the vendor (and copied)" : "New link copied — share it with the vendor");
      } else if (action === "accept") {
        toast.success(json.vendorEmailed ? `Accepted — ${q.vendor.name} has been emailed` : `Accepted — let ${q.vendor.name} know`);
      } else if (ok) toast.success(ok);
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={() => onClose(changed)} title="Quotes">
      {!data ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-body font-medium text-header">{data.jobTitle}</p>
            <p className="text-caption text-gray-500">{data.propertyName}{data.unitNumber ? ` · Unit ${data.unitNumber}` : ""}</p>
          </div>

          {data.quotes.length === 0 && !asking && (
            <p className="text-body text-gray-500">No quotes yet. Ask one or more vendors — each gets their own link to send a price, a date and their quote document.</p>
          )}

          <div className="space-y-2">
            {data.quotes.map((q) => (
              <div key={q.id} className={`rounded-lg border p-3 ${q.status === "ACCEPTED" ? "border-green-200 bg-green-50/40" : "border-gray-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-header truncate">{q.vendor.name}</p>
                    <p className="text-caption text-gray-400">
                      {q.vendor.category.replace(/_/g, " ").toLowerCase()}
                      {q.requestedByName ? ` · asked by ${q.requestedByName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={STATUS_BADGE[q.status]} className="whitespace-nowrap">{QUOTE_STATUS_LABEL[q.status]}</Badge>
                    {q.amount !== null && (
                      <span className={`text-body font-semibold tabular-nums ${lowest?.id === q.id && data.quotes.filter((x) => x.amount !== null).length > 1 ? "text-income" : "text-header"}`}>
                        {formatCurrency(q.amount, data.currency)}
                      </span>
                    )}
                  </div>
                </div>

                {(q.note || q.availableDate || q.document || q.receivedVia) && (
                  <div className="mt-1.5 space-y-0.5 text-caption text-gray-500">
                    {q.availableDate && <p>Available {format(new Date(q.availableDate), "EEE d MMM")}</p>}
                    {q.note && <p className="whitespace-pre-wrap">{q.note}</p>}
                    {q.document && (
                      q.document.url
                        ? <a href={q.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-dark"><FileText size={12} /> {q.document.name}</a>
                        : <span className="inline-flex items-center gap-1"><FileText size={12} /> {q.document.name}</span>
                    )}
                    {q.receivedVia && <p className="text-gray-400">{q.receivedVia === "Vendor" ? "Sent by the vendor through their link" : `Typed in by ${q.receivedVia}`}</p>}
                  </div>
                )}
                {q.status === "DECLINED" && q.declineReason && <p className="mt-1 text-caption text-gray-400">{q.declineReason}</p>}
                {q.needsOwnerApproval && q.status !== "DECLINED" && (
                  <p className="mt-1.5 text-caption text-amber-700">
                    Above the repair authority limit{data.repairAuthorityLimit ? ` (${formatCurrency(data.repairAuthorityLimit, data.currency)})` : ""} — {data.viewer.isManager
                      ? <>get the owner&apos;s approval first (Request approval on the job&apos;s case).</>
                      : <>the owner approves it first.</>}
                  </p>
                )}

                {recording === q.id ? (
                  <RecordForm quote={q} jobId={jobId} currency={data.currency}
                    onDone={(next) => { setRecording(null); if (next) { apply(next); toast.success("Quote recorded"); } }} />
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-caption">
                    {open && (q.status === "REQUESTED" || q.status === "RECEIVED") && (
                      <>
                        {q.linkUrl && <ShareLink quote={q} currency={data.currency} jobTitle={data.jobTitle} />}
                        {q.linkState === "expired" && <span className="text-amber-700">Link expired</span>}
                        <button type="button" onClick={() => act(q, "resend")} disabled={busy !== null} className="text-gray-500 hover:text-gold-dark">
                          {q.linkState === "expired" ? "New link" : "Re-send link"}
                        </button>
                        <button type="button" onClick={() => setRecording(q.id)} className="text-gray-500 hover:text-gold-dark">
                          {q.amount === null ? "Type in quote" : "Edit quote"}
                        </button>
                      </>
                    )}
                    {data.viewer.isManager && open && q.status === "RECEIVED" && (
                      <Button size="sm" onClick={() => act(q, "accept")} loading={busy === `accept:${q.id}`} disabled={busy !== null}>
                        <Check size={13} /> Accept
                      </Button>
                    )}
                    {data.viewer.isManager && open && (q.status === "REQUESTED" || q.status === "RECEIVED") && (
                      <button type="button" disabled={busy !== null}
                        onClick={() => { const reason = window.prompt(`Decline ${q.vendor.name}'s quote? Add a reason (optional):`, ""); if (reason !== null) act(q, "decline", { reason }, "Quote declined"); }}
                        className="text-gray-400 hover:text-expense inline-flex items-center gap-1"><X size={12} /> Decline</button>
                    )}
                    {data.viewer.isManager && q.status === "ACCEPTED" && (
                      <button type="button" onClick={() => act(q, "unaccept", {}, "Acceptance undone")} disabled={busy !== null}
                        className="text-gray-400 hover:text-gray-700 inline-flex items-center gap-1"><Undo2 size={12} /> Undo acceptance</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!data.viewer.isManager && data.quotes.some((q) => q.status === "RECEIVED") && (
            <p className="text-caption text-gray-500">A manager compares the quotes and accepts one.</p>
          )}

          {open && (asking
            ? <AskForm jobId={jobId} existing={data.quotes.map((q) => q.vendor.id)} currency={data.currency} jobTitle={data.jobTitle}
                onDone={(next) => { setAsking(false); if (next) apply(next); }} />
            : <Button variant="ghost" size="sm" onClick={() => setAsking(true)}><Plus size={14} /> Ask {data.quotes.length ? "more vendors" : "vendors for quotes"}</Button>)}
        </div>
      )}
    </Modal>
  );
}

function shareMessage(vendorName: string, jobTitle: string, url: string) {
  return `Hello ${vendorName}, please send us your quote for "${jobTitle}" here — no login needed: ${url}`;
}

function ShareLink({ quote, currency, jobTitle }: { quote: QuoteDto; currency: string; jobTitle: string }) {
  const phone = quote.vendor.phone ? normalizePhoneForWhatsApp(quote.vendor.phone, dialCodeForCurrency(currency)) : null;
  return (
    <>
      <button type="button" className="text-gray-500 hover:text-gold-dark inline-flex items-center gap-1"
        onClick={async () => { try { await navigator.clipboard.writeText(quote.linkUrl!); toast.success("Link copied"); } catch { toast.error("Couldn't copy — long-press the link instead"); } }}>
        <Copy size={12} /> Copy link
      </button>
      {phone && (
        <a href={buildWhatsAppLink(phone, shareMessage(quote.vendor.name, jobTitle, quote.linkUrl!))} target="_blank" rel="noopener noreferrer"
          className="text-green-700 hover:text-green-800 inline-flex items-center gap-1"><Send size={12} /> WhatsApp</a>
      )}
    </>
  );
}

function RecordForm({ quote, jobId, currency, onDone }: { quote: QuoteDto; jobId: string; currency: string; onDone: (next: QuotesDto | null) => void }) {
  const [amount, setAmount] = useState(quote.amount !== null ? String(quote.amount) : "");
  const [note, setNote] = useState(quote.note ?? "");
  const [date, setDate] = useState(quote.availableDate ? quote.availableDate.slice(0, 10) : "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/maintenance/${jobId}/quotes/${quote.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record", amount: amount.replace(/,/g, ""), note: note || null, availableDate: date || null }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't save the quote")); return; }
      let next: QuotesDto = await res.json();
      if (file) {
        const fd = new FormData();
        fd.append("file", file.type.startsWith("image/") ? await maybeCompressImage(file) : file);
        const up = await fetch(`/api/maintenance/${jobId}/quotes/${quote.id}/document`, { method: "POST", body: fd });
        if (up.ok) next = await up.json();
        else toast.error(await readError(up, "The quote was saved, but the document didn't upload"));
      }
      onDone(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-cream/60 p-2">
      <div className="flex gap-2">
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount (${currency})`}
          className="w-36 border border-gray-200 rounded-lg text-body px-3 py-1.5 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/40" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Available from"
          className="flex-1 border border-gray-200 rounded-lg text-body px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/40" />
      </div>
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Scope, materials, exclusions (optional)"
        className="w-full border border-gray-200 rounded-lg text-body px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/40" />
      <div className="flex items-center justify-between gap-2">
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => fileRef.current?.click()} className="text-caption text-gray-500 hover:text-gold-dark inline-flex items-center gap-1 min-w-0">
          <Paperclip size={12} /> <span className="truncate">{file ? file.name : "Attach the quote (photo or PDF)"}</span>
        </button>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onDone(null)}>Cancel</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!amount.trim()}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function AskForm({ jobId, existing, currency, jobTitle, onDone }: { jobId: string; existing: string[]; currency: string; jobTitle: string; onDone: (next: QuotesDto | null) => void }) {
  const [vendors, setVendors] = useState<VendorOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ vendorName: string; url: string | null; emailed: boolean; skipped?: string }[] | null>(null);
  const [next, setNext] = useState<QuotesDto | null>(null);

  useEffect(() => {
    fetch("/api/vendors").then((r) => (r.ok ? r.json() : [])).then((rows) => {
      const list: VendorOption[] = Array.isArray(rows) ? rows : rows.vendors ?? [];
      setVendors(list.filter((v) => v.isActive && !existing.includes(v.id)).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setVendors([]));
  }, [existing]);

  async function send() {
    setSending(true);
    try {
      const res = await fetch(`/api/maintenance/${jobId}/quotes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds: picked, message: message.trim() || null }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't send the requests")); return; }
      const json = await res.json();
      setResults(json.results);
      setNext(json);
    } finally {
      setSending(false);
    }
  }

  if (results) {
    const byName = new Map((next?.quotes ?? []).map((q) => [q.vendor.name, q]));
    return (
      <div className="rounded-lg border border-gray-200 p-3 space-y-2">
        <p className="text-body font-medium text-header">Quote requests sent</p>
        {results.map((r) => {
          const q = byName.get(r.vendorName);
          return (
            <div key={r.vendorName} className="flex flex-wrap items-center justify-between gap-2 text-caption">
              <span className="text-header">{r.vendorName}</span>
              <span className="flex items-center gap-3">
                {r.skipped ? <span className="text-gray-400">Skipped — {r.skipped}</span>
                  : r.emailed ? <span className="text-green-700">Emailed</span>
                  : <span className="text-amber-700">No email — share the link</span>}
                {q?.linkUrl && <ShareLink quote={q} currency={currency} jobTitle={jobTitle} />}
              </span>
            </div>
          );
        })}
        <div className="flex justify-end"><Button size="sm" onClick={() => onDone(next)}>Done</Button></div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <p className="text-body font-medium text-header">Ask vendors for a quote</p>
      {!vendors ? <Spinner /> : vendors.length === 0 ? (
        <p className="text-caption text-gray-500">No other active vendors — add one on the Vendors page.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-100">
          {vendors.map((v) => (
            <label key={v.id} className="flex items-center gap-2 px-3 py-2 text-body cursor-pointer hover:bg-cream/50">
              <input type="checkbox" checked={picked.includes(v.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, v.id] : p.filter((x) => x !== v.id)))} />
              <span className="flex-1 min-w-0 truncate">{v.name}</span>
              <span className="text-caption text-gray-400">{v.category.replace(/_/g, " ").toLowerCase()}</span>
            </label>
          ))}
        </div>
      )}
      <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to the vendors (optional)"
        className="w-full border border-gray-200 rounded-lg text-body px-3 py-1.5 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDone(null)}>Cancel</Button>
        <Button size="sm" onClick={send} loading={sending} disabled={picked.length === 0}>
          <Send size={13} /> Send {picked.length > 1 ? `${picked.length} requests` : "request"}
        </Button>
      </div>
      <p className="text-caption text-gray-400">Vendors with an email address get the link by email; for the others, copy it or send it on WhatsApp.</p>
    </div>
  );
}
