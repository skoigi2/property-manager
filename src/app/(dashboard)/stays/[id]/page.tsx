"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { maybeCompressImage } from "@/lib/image-compress";
import { KEY_PRESETS, INSPECTION_STATUS_LABEL, type InspectionKey } from "@/lib/inspection-rules";
import { STAY_STAGE_LABEL, guestHasKeys } from "@/lib/stay-rules";
import {
  BedDouble, Camera, ChevronLeft, ClipboardCheck, FileText, IdCard, KeyRound, Minus, Phone, Plus, Sparkles, Trash2, Undo2, UserPlus,
} from "lucide-react";
import { dayLabel, localDay, readError, stageOf, PLATFORM_LABEL, type StayDto, type StayGuestDto } from "@/components/stays/types";

// One stay on site: the guests and their ID, keys to the guest and back, the
// post-stay check, keys to the cleaner and back. Never money.

const CLEANER_KEY = "gw:last-cleaner-name";

export default function StayPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const [stay, setStay] = useState<StayDto | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/stays/${id}`);
    if (!res.ok) { setMissing(true); return; }
    setStay(await res.json());
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Header title="Guest stay" userName={session?.user?.name ?? session?.user?.email} role={orgRole} />
      <div className="page-container space-y-3 pb-24 lg:pb-8 max-w-3xl">
        <Link href="/stays" className="inline-flex items-center gap-1 text-caption text-gray-500 hover:text-gold-dark">
          <ChevronLeft size={14} /> All stays
        </Link>
        {missing ? (
          <EmptyState icon={<BedDouble size={40} />} title="Stay not found" description="It may have been deleted, or it's on a property you can't access." />
        ) : !stay ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <StayDetail stay={stay} onChanged={setStay} />
        )}
      </div>
    </div>
  );
}

function StayDetail({ stay, onChanged }: { stay: StayDto; onChanged: (s: StayDto) => void }) {
  const today = localDay();
  const stage = stageOf(stay, today);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, body: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(action + (body.step ?? ""));
    try {
      const res = await fetch(`/api/stays/${stay.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't save that")); return false; }
      onChanged(await res.json());
      toast.success(ok);
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="!p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h3 text-header">Unit {stay.unit.unitNumber} · {stay.property.name}</h2>
            <p className="text-body text-gray-500">
              {dayLabel(stay.checkIn)} – {dayLabel(stay.checkOut)} · {stay.nights} night{stay.nights === 1 ? "" : "s"}
              {stay.platform ? ` · ${PLATFORM_LABEL[stay.platform] ?? stay.platform}` : ""}
            </p>
          </div>
          <Badge variant={stage === "done" ? "green" : stage === "turnover" ? "amber" : stage === "in_house" ? "blue" : "gold"}>{STAY_STAGE_LABEL[stage]}</Badge>
        </div>
      </Card>

      <GuestsCard stay={stay} onChanged={onChanged} act={act} busy={busy} />
      <KeysCard stay={stay} act={act} busy={busy} />
      <CheckCard stay={stay} />
      <CleanerCard stay={stay} act={act} busy={busy} />
    </div>
  );
}

type Act = (action: string, body: Record<string, unknown>, ok: string) => Promise<boolean>;

// ── Guests and ID ─────────────────────────────────────────────────────────────

function GuestsCard({ stay, onChanged, act, busy }: { stay: StayDto; onChanged: (s: StayDto) => void; act: Act; busy: string | null }) {
  const [adding, setAdding] = useState(stay.guests.length === 0);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const st = stay.stay;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-h3 text-header flex items-center gap-2"><IdCard size={16} /> Guests and ID</h3>
        {!adding && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><UserPlus size={14} /> Add guest</Button>}
      </div>

      {stay.idState === "missing" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-body text-amber-800 mb-3">
          Upload the main guest&apos;s ID (passport or national ID) before handing over the keys.
          {stay.viewer.isManager && !st.keysHandedAt && (
            <button type="button" onClick={() => { setReason(""); setOverrideOpen(true); }} className="block mt-1 text-caption text-amber-900 underline">
              Let the keys go without it…
            </button>
          )}
        </div>
      )}
      {stay.idState === "overridden" && (
        <p className="text-caption text-gray-500 mb-3">
          ID waived by {st.idOverrideByName ?? "a manager"}{st.idOverrideAt ? ` on ${format(new Date(st.idOverrideAt), "d MMM, HH:mm")}` : ""}: {st.idOverrideReason}
        </p>
      )}

      <div className="space-y-3">
        {stay.guests.map((g) => <GuestRow key={g.id} stayId={stay.id} guest={g} onChanged={onChanged} />)}
        {stay.guests.length === 0 && !adding && <p className="text-body text-gray-400">No guests recorded yet.</p>}
      </div>

      {adding && <AddGuestForm stayId={stay.id} first={stay.guests.length === 0} onDone={(s) => { if (s) onChanged(s); setAdding(false); }} />}

      <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Hand over keys without the ID">
        <div className="space-y-3">
          <p className="text-body text-gray-600">Say why — for example, you saw the ID but the guest refused a copy. It is recorded on the stay.</p>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button loading={busy === "override_id"} disabled={!reason.trim()}
              onClick={async () => { if (await act("override_id", { reason: reason.trim() }, "Recorded — the keys can be handed over")) setOverrideOpen(false); }}>
              Record and allow keys
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function GuestRow({ stayId, guest, onChanged }: { stayId: string; guest: StayGuestDto; onChanged: (s: StayDto) => void }) {
  const [uploading, setUploading] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(raw: File) {
    setUploading(true);
    try {
      const file = raw.type.startsWith("image/") ? await maybeCompressImage(raw) : raw;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", "ID document");
      const res = await fetch(`/api/stays/${stayId}/guests/${guest.id}/documents`, { method: "POST", body: fd });
      if (!res.ok) { toast.error(await readError(res, "Upload failed")); return; }
      onChanged(await res.json());
      toast.success("ID uploaded");
    } finally {
      setUploading(false);
    }
  }
  async function remove(docId: string) {
    const res = await fetch(`/api/stays/${stayId}/guests/${guest.id}/documents/${docId}`, { method: "DELETE" });
    if (!res.ok) { toast.error(await readError(res, "Couldn't delete it")); return; }
    onChanged(await res.json());
  }

  return (
    <div className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body font-medium text-header">
            {guest.name} {guest.isPrimary && <span className="text-caption text-gold-dark font-normal">· main guest</span>}
          </p>
          <p className="text-caption text-gray-500 flex flex-wrap gap-x-3">
            {guest.phone && <a href={`tel:${guest.phone}`} className="flex items-center gap-1 text-gold-dark"><Phone size={11} /> {guest.phone}</a>}
            {guest.idNumber && <span>ID {guest.idNumber}</span>}
            {guest.nationality && <span>{guest.nationality}</span>}
          </p>
        </div>
        {guest.documents.length > 0
          ? <Badge variant="green">ID on file</Badge>
          : <Badge variant={guest.isPrimary ? "amber" : "gray"}>No ID</Badge>}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {guest.documents.map((d) => (
          <div key={d.id} className="relative w-16 h-16 rounded overflow-hidden border border-gray-200 bg-gray-50">
            {d.url && d.mimeType?.startsWith("image/")
              // eslint-disable-next-line @next/next/no-img-element
              ? <a href={d.url} target="_blank" rel="noreferrer"><img src={d.url} alt={d.label} className="w-full h-full object-cover" /></a>
              : <a href={d.url ?? "#"} target="_blank" rel="noreferrer" className="w-full h-full flex flex-col items-center justify-center text-gray-400 text-label"><FileText size={18} />{d.mimeType === "application/pdf" ? "PDF" : "File"}</a>}
            {d.canDelete && (
              <button type="button" onClick={() => remove(d.id)} aria-label="Delete document" className="absolute top-0 right-0 bg-black/60 text-white rounded-bl px-1">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); if (camera.current) camera.current.value = ""; }} />
        <input ref={picker} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); if (picker.current) picker.current.value = ""; }} />
        <Button size="sm" variant="ghost" onClick={() => camera.current?.click()} loading={uploading}><Camera size={14} /> Photo of ID</Button>
        <button type="button" onClick={() => picker.current?.click()} className="text-caption text-gray-500 hover:text-gold-dark" disabled={uploading}>or choose a file</button>
      </div>
    </div>
  );
}

function AddGuestForm({ stayId, first, onDone }: { stayId: string; first: boolean; onDone: (s: StayDto | null) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [nationality, setNationality] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Type the guest's name"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/stays/${stayId}/guests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, idNumber: idNumber.trim() || null, nationality: nationality.trim() || null }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't add the guest")); return; }
      toast.success("Guest added");
      onDone(await res.json());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-3 space-y-2">
      <p className="text-body font-medium text-gray-700">{first ? "Main guest" : "Another guest"}</p>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7…" />
        <Input label="ID / passport number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
      </div>
      <Input label="Nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
      <div className="flex justify-end gap-2">
        {!first && <Button variant="ghost" size="sm" onClick={() => onDone(null)}>Cancel</Button>}
        <Button size="sm" onClick={save} loading={saving}>Add guest</Button>
      </div>
    </div>
  );
}

// ── Keys ──────────────────────────────────────────────────────────────────────

function KeysCard({ stay, act, busy }: { stay: StayDto; act: Act; busy: string | null }) {
  const st = stay.stay;
  const [counts, setCounts] = useState<Record<string, number>>({ "Main door": 1 });
  const [custom, setCustom] = useState("");
  const keys: InspectionKey[] = Object.entries(counts).filter(([, n]) => n > 0).map(([label, count]) => ({ label, count }));
  const labels = Array.from(new Set([...KEY_PRESETS, ...Object.keys(counts)]));
  const isManager = stay.viewer.isManager;

  return (
    <Card>
      <h3 className="text-h3 text-header flex items-center gap-2 mb-2"><KeyRound size={16} /> Keys</h3>
      {!st.keysHandedAt ? (
        <div className="space-y-2">
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {labels.map((label) => (
              <div key={label} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-body text-header">{label}</span>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={`Fewer ${label}`} onClick={() => setCounts((c) => ({ ...c, [label]: Math.max(0, (c[label] ?? 0) - 1) }))} className="p-1 rounded border border-gray-200 text-gray-500"><Minus size={12} /></button>
                  <span className="w-5 text-center tabular-nums text-body">{counts[label] ?? 0}</span>
                  <button type="button" aria-label={`More ${label}`} onClick={() => setCounts((c) => ({ ...c, [label]: Math.min(99, (c[label] ?? 0) + 1) }))} className="p-1 rounded border border-gray-200 text-gray-500"><Plus size={12} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other key (e.g. Pool gate)"
              className="flex-1 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
            <Button size="sm" variant="ghost" onClick={() => { const l = custom.trim(); if (l) { setCounts((c) => ({ ...c, [l]: (c[l] ?? 0) + 1 })); setCustom(""); } }}><Plus size={14} /> Add</Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => act("hand_keys", { keys }, "Keys handed over")} loading={busy === "hand_keys"}
              disabled={stay.idState === "missing" || keys.length === 0}
              title={stay.idState === "missing" ? "Upload the main guest's ID first" : undefined}>
              <KeyRound size={14} /> Hand over keys
            </Button>
          </div>
          {stay.idState === "missing" && <p className="text-caption text-amber-700 text-right">Waiting for the main guest&apos;s ID.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-body text-gray-700">
            Handed over {st.keysHanded.map((k) => `${k.count}× ${k.label}`).join(", ")}
            <span className="text-gray-400"> · {st.keysHandedByName}, {format(new Date(st.keysHandedAt), "d MMM, HH:mm")}</span>
          </p>
          {st.keysReturnedAt ? (
            <p className="text-body text-green-700">
              Back {format(new Date(st.keysReturnedAt), "d MMM, HH:mm")} <span className="text-gray-400">· {st.keysReturnedByName}</span>
            </p>
          ) : (
            <div className="flex justify-end">
              <Button onClick={() => act("return_keys", {}, "Keys back")} loading={busy === "return_keys"}>Keys returned</Button>
            </div>
          )}
          {isManager && (
            <div className="flex justify-end gap-3 text-caption">
              {st.keysReturnedAt && !st.cleanerKeysOutAt && <UndoLink onClick={() => act("undo", { step: "keys_back" }, "Undone")} busy={busy === "undokeys_back"} label="Undo keys returned" />}
              {!st.keysReturnedAt && <UndoLink onClick={() => act("undo", { step: "keys_out" }, "Undone")} busy={busy === "undokeys_out"} label="Undo handover" />}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function UndoLink({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="flex items-center gap-1 text-gray-400 hover:text-gray-700">
      <Undo2 size={12} /> {label}
    </button>
  );
}

// ── Post-stay check ───────────────────────────────────────────────────────────

function CheckCard({ stay }: { stay: StayDto }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const insp = stay.inspections[0] ?? null;

  async function start() {
    setStarting(true);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: stay.unit.id, reportType: "POST_STAY", incomeEntryId: stay.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.existingId) { router.push(`/inspections/${body.existingId}`); return; }
      if (!res.ok) { toast.error(typeof body.error === "string" ? body.error : "Couldn't start the check"); return; }
      router.push(`/inspections/${body.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card>
      <h3 className="text-h3 text-header flex items-center gap-2 mb-2"><ClipboardCheck size={16} /> Post-stay check</h3>
      {!insp ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-body text-gray-500">A quick room-by-room check once the guest has left: fine or damaged, with a photo of each room.</p>
          <Button onClick={start} loading={starting} disabled={guestHasKeys(stay.stay)}
            title={guestHasKeys(stay.stay) ? "Get the keys back first" : undefined}>
            Start the check
          </Button>
        </div>
      ) : (
        <Link href={`/inspections/${insp.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:border-gold/40">
          <span className="text-body text-header">
            {insp.status === "SCHEDULED" || insp.status === "IN_PROGRESS" ? "Continue the check" : "View the check"}
            {insp.damaged > 0 && <span className="text-expense font-medium"> · {insp.damaged} damaged</span>}
          </span>
          <Badge variant={insp.status === "ACCEPTED" ? "green" : insp.status === "SUBMITTED" ? "amber" : "blue"}>{INSPECTION_STATUS_LABEL[insp.status]}</Badge>
        </Link>
      )}
    </Card>
  );
}

// ── Cleaner keys ──────────────────────────────────────────────────────────────

function CleanerCard({ stay, act, busy }: { stay: StayDto; act: Act; busy: string | null }) {
  const st = stay.stay;
  const [name, setName] = useState("");
  useEffect(() => { try { setName(localStorage.getItem(CLEANER_KEY) ?? ""); } catch { /* private mode */ } }, []);
  const blocked = guestHasKeys(st);

  return (
    <Card>
      <h3 className="text-h3 text-header flex items-center gap-2 mb-2"><Sparkles size={16} /> Cleaning</h3>
      {!st.cleanerKeysOutAt ? (
        <div className="space-y-2">
          <Input label="Keys given to (cleaning supervisor)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <div className="flex justify-end">
            <Button loading={busy === "cleaner_out"} disabled={blocked || !name.trim()}
              title={blocked ? "Get the keys back from the guest first" : undefined}
              onClick={async () => {
                if (await act("cleaner_out", { cleanerName: name.trim() }, "Keys given to the cleaner")) {
                  try { localStorage.setItem(CLEANER_KEY, name.trim()); } catch { /* private mode */ }
                }
              }}>
              Keys to the cleaner
            </Button>
          </div>
          {blocked && <p className="text-caption text-gray-400 text-right">The guest still has the keys.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-body text-gray-700">
            With {st.cleanerName} since {format(new Date(st.cleanerKeysOutAt), "d MMM, HH:mm")}
            <span className="text-gray-400"> · given by {st.cleanerKeysOutByName}</span>
          </p>
          {st.cleanerKeysBackAt ? (
            <p className="text-body text-green-700">
              Back {format(new Date(st.cleanerKeysBackAt), "d MMM, HH:mm")} <span className="text-gray-400">· {st.cleanerKeysBackByName}</span>
            </p>
          ) : (
            <div className="flex justify-end">
              <Button onClick={() => act("cleaner_back", {}, "Keys back from the cleaner")} loading={busy === "cleaner_back"}>Keys back from the cleaner</Button>
            </div>
          )}
          {stay.viewer.isManager && (
            <div className="flex justify-end gap-3 text-caption">
              {st.cleanerKeysBackAt
                ? <UndoLink onClick={() => act("undo", { step: "cleaner_back" }, "Undone")} busy={busy === "undocleaner_back"} label="Undo keys back" />
                : <UndoLink onClick={() => act("undo", { step: "cleaner_out" }, "Undone")} busy={busy === "undocleaner_out"} label="Undo keys to the cleaner" />}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
