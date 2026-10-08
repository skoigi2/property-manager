"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Camera, ChevronLeft, ChevronRight, Loader2, CheckCircle2, Plus, X, Send, AlertTriangle, Phone, IdCard } from "lucide-react";
import { maybeCompressImage } from "@/lib/image-compress";
import { seedItemsFromTemplate } from "@/lib/condition-report-template";
import {
  INSPECTION_TYPE_LABEL, POST_STAY_FEATURE, minPhotosPerRoom, ratingOptions, itemStatusLabel, roomPhotoCounts, submitProblems,
  type InspectionItem, type InspectionKey, type InspectionType, type ItemStatus, type TenantSignOff,
} from "@/lib/inspection-rules";
import { SignaturePad } from "./SignaturePad";
import { KeysEditor } from "./KeysEditor";
import { baselineFor, baselineLabel, readError, type InspectionDto } from "./types";
import { TenantMoneyCard } from "./TenantMoneyCard";

interface PhotoState {
  localId: string;
  serverId: string | null;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  fileName: string;
  itemId: string;
}

export function InspectionWalkthrough({ inspection, onChanged }: { inspection: InspectionDto; onChanged: (next: InspectionDto) => void }) {
  const id = inspection.id;
  const isManager = inspection.viewer.isManager;
  const type = inspection.reportType;
  const postStay = type === "POST_STAY";
  const minPhotos = minPhotosPerRoom(type);

  const [items, setItems] = useState<InspectionItem[]>(() =>
    inspection.items.length ? inspection.items : (seedItemsFromTemplate() as InspectionItem[]));
  const [overallComments, setOverallComments] = useState(inspection.overallComments ?? "");
  const [tenantIssues, setTenantIssues] = useState(inspection.tenantIssues ?? "");
  const [signOff, setSignOff] = useState<TenantSignOff | null>(inspection.tenantSignOff);
  const [signedName, setSignedName] = useState(inspection.tenantSignedName ?? inspection.tenant?.name ?? "");
  const [disagrees, setDisagrees] = useState(inspection.tenantDisagrees);
  const [tenantComments, setTenantComments] = useState(inspection.tenantComments ?? "");
  const [signatureUrl, setSignatureUrl] = useState<string | null>(inspection.tenantSignatureUrl);
  const [keys, setKeys] = useState<InspectionKey[]>(inspection.keys);
  const [meterValues, setMeterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(inspection.meterReadings.map((r) => [r.meterId, String(r.reading)])));
  const [photos, setPhotos] = useState<PhotoState[]>(() => {
    const owner = new Map<string, string>();
    for (const it of inspection.items) for (const pid of it.photoIds ?? []) owner.set(pid, it.id);
    return inspection.photos
      .filter((p) => owner.has(p.id))
      .map((p) => ({ localId: p.id, serverId: p.id, previewUrl: p.url ?? "", status: "ready" as const, fileName: p.fileName, itemId: owner.get(p.id)! }));
  });
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [keysState, setKeysState] = useState(inspection.keysState);
  const [clearingKeys, setClearingKeys] = useState(false);

  const rooms = useMemo(() => {
    const order: string[] = [];
    for (const it of items) if (!order.includes(it.room)) order.push(it.room);
    return order;
  }, [items]);
  const totalSteps = rooms.length + 1;
  const currentRoom = step < rooms.length ? rooms[step] : null;
  const uploadingCount = photos.filter((p) => p.status === "uploading").length;
  const readyPhotoIds = useMemo(() => new Set(photos.filter((p) => p.status === "ready" && p.serverId).map((p) => p.serverId!)), [photos]);
  const photoCounts = useMemo(() => new Map(roomPhotoCounts(items, readyPhotoIds).map((r) => [r.room, r.photos])), [items, readyPhotoIds]);

  // ── Autosave (debounced) ────────────────────────────────────────────────────
  const first = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Promise<unknown> | null>(null);
  const meterReadingsPayload = () =>
    Object.entries(meterValues).filter(([, v]) => v.trim() !== "").map(([meterId, v]) => ({ meterId, reading: v }));
  function payload() {
    return {
      items, overallComments, tenantIssues,
      meterReadings: meterReadingsPayload(),
      tenantSignOff: signOff,
      tenantSignedName: signedName || null,
      tenantDisagrees: disagrees,
      tenantComments: tenantComments || null,
    };
  }
  async function saveNow() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    // One save at a time: wait for the one in flight, so saves land in order
    // and none can arrive after a hand-in (the server would refuse it as locked).
    const body = JSON.stringify(payload());
    const p = (pending.current ?? Promise.resolve())
      .catch(() => {})
      .then(() => fetch(`/api/condition-reports/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body,
      }))
      .then(async (res) => { if (!res.ok) toast.error(await readError(res, "Couldn't save — check your connection")); })
      .catch(() => { toast.error("Couldn't save — check your connection"); });
    pending.current = p;
    await p;
  }
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNow(); }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overallComments, tenantIssues, signOff, signedName, disagrees, tenantComments, meterValues]);

  // ── Items ───────────────────────────────────────────────────────────────────
  const update = (itemId: string, patch: Partial<InspectionItem>) =>
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  function addFeature(room: string, feature: string) {
    if (!feature.trim()) return;
    setItems((prev) => [...prev, { id: randomId(), room, feature: feature.trim(), status: null, notes: "", photoIds: [] }]);
  }
  function addRoom(name: string) {
    if (!name.trim() || rooms.includes(name.trim())) return;
    setItems((prev) => [...prev, { id: randomId(), room: name.trim(), feature: postStay ? POST_STAY_FEATURE : "Walls", status: null, notes: "", photoIds: [] }]);
    setTimeout(() => setStep(rooms.length), 0);
  }
  function removeRoom(room: string) {
    if (photos.some((p) => items.find((i) => i.id === p.itemId)?.room === room)) {
      toast.error("Delete this room's photos first");
      return;
    }
    setItems((prev) => prev.filter((i) => i.room !== room));
    setStep((s) => Math.max(0, Math.min(s, rooms.length - 2)));
  }

  // ── Photos ──────────────────────────────────────────────────────────────────
  async function capture(itemId: string, raw: File) {
    const localId = randomId();
    const file = await maybeCompressImage(raw);
    setPhotos((p) => [...p, { localId, serverId: null, previewUrl: URL.createObjectURL(file), status: "uploading", fileName: file.name, itemId }]);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/condition-reports/${id}/photos`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await readError(res, "Upload failed"));
      const data: { id: string } = await res.json();
      setPhotos((prev) => prev.map((p) => (p.localId === localId ? { ...p, serverId: data.id, status: "ready" } : p)));
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, photoIds: [...it.photoIds, data.id] } : it)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setPhotos((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: "error" } : p)));
    }
  }
  async function deletePhoto(localId: string) {
    const target = photos.find((p) => p.localId === localId);
    if (!target) return;
    if (target.serverId) {
      const res = await fetch(`/api/condition-reports/${id}/photos/${target.serverId}`, { method: "DELETE" });
      if (!res.ok) { toast.error(await readError(res, "Couldn't delete the photo")); return; }
    }
    setItems((prev) => prev.map((it) => ({ ...it, photoIds: it.photoIds.filter((pid) => pid !== target.serverId) })));
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
  }

  // ── Signature + keys ────────────────────────────────────────────────────────
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [savingSig, setSavingSig] = useState(false);
  async function saveSignature() {
    if (!signatureBlob) return;
    if (!signedName.trim()) { toast.error("Type the name of the person signing"); return; }
    setSavingSig(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([signatureBlob], "signature.png", { type: "image/png" }));
      fd.append("name", signedName.trim());
      const res = await fetch(`/api/condition-reports/${id}/signature`, { method: "POST", body: fd });
      if (!res.ok) { toast.error(await readError(res, "Couldn't save the signature")); return; }
      const data: { url: string | null } = await res.json();
      setSignatureUrl(data.url ?? "saved");
      setSignatureBlob(null);
      toast.success("Signature saved");
    } finally {
      setSavingSig(false);
    }
  }
  async function clearKeys() {
    setClearingKeys(true);
    try {
      const res = await fetch(`/api/condition-reports/${id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear_keys" }),
      });
      if (!res.ok) { toast.error(await readError(res, "Couldn't clear the keys")); return; }
      setKeysState("open");
      toast.success("Keys cleared");
    } finally {
      setClearingKeys(false);
    }
  }
  async function saveKeys(next: InspectionKey[]) {
    setKeys(next);
    setSavingKeys(true);
    try {
      const res = await fetch(`/api/condition-reports/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: next }),
      });
      if (!res.ok) toast.error(await readError(res, "Couldn't save the keys"));
    } finally {
      setSavingKeys(false);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const problems = submitProblems({
    reportType: inspection.reportType,
    status: "IN_PROGRESS",
    hasTenant: !!inspection.tenant,
    items,
    photoIds: readyPhotoIds,
    tenantSignOff: signOff,
    tenantSignedName: signedName,
    tenantSignaturePath: signatureUrl,
    meters: inspection.meters,
    meterReadings: meterReadingsPayload().filter((r) => Number.isFinite(Number(r.reading)) && Number(r.reading) >= 0),
  });
  async function submit(accept: boolean) {
    if (uploadingCount > 0) { toast.error("Photos are still uploading"); return; }
    setSubmitting(true);
    try {
      await saveNow();
      const res = await fetch(`/api/condition-reports/${id}/${accept ? "finalize" : "submit"}`, { method: "POST" });
      if (!res.ok) { toast.error(await readError(res, "Couldn't hand in the inspection")); return; }
      const body = await res.json();
      const next: InspectionDto = accept ? body.inspection : body;
      toast.success(
        accept ? (inspection.tenant ? "Inspection accepted and saved to the tenant's documents" : "Inspection accepted")
        : next.status === "ACCEPTED" ? "Handed in — no damage, so it's filed"
        : "Inspection handed in — the manager has been told");
      onChanged(next);
    } finally {
      setSubmitting(false);
    }
  }

  const t = inspection.tenant;
  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h2 className="text-h3 text-header">{INSPECTION_TYPE_LABEL[inspection.reportType]} inspection · Unit {inspection.unit.unitNumber}</h2>
            <p className="text-body text-gray-500">
              {inspection.property.name}
              {inspection.scheduledFor ? ` · ${format(new Date(inspection.scheduledFor), "EEE d MMM, HH:mm")}` : ""}
            </p>
            {inspection.booking && (
              <p className="text-caption text-gray-500 mt-1">
                Stay {format(new Date(inspection.booking.checkIn), "d MMM")} – {format(new Date(inspection.booking.checkOut), "d MMM")}
                {inspection.booking.guestName ? ` · ${inspection.booking.guestName}` : ""}
                {" · "}<a href={`/stays/${inspection.booking.id}`} className="text-gold-dark">Back to the stay</a>
              </p>
            )}
            {t && (
              <p className="text-caption text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span className="font-medium text-gray-700">{t.name}</span>
                {t.phone && <a href={`tel:${t.phone}`} className="flex items-center gap-1 text-gold-dark"><Phone size={11} /> {t.phone}</a>}
                {t.nationalId && <span className="flex items-center gap-1"><IdCard size={11} /> ID {t.nationalId}</span>}
                {t.leaseStart && <span>Lease from {format(new Date(t.leaseStart), "d MMM yyyy")}</span>}
              </p>
            )}
            {t && (t.emergencyContactName || t.emergencyContactPhone) && (
              <p className="text-caption text-gray-500 mt-1">
                Emergency: {[t.emergencyContactName, t.emergencyContactRelation ? `(${t.emergencyContactRelation})` : null].filter(Boolean).join(" ")}
                {t.emergencyContactPhone && <> · <a href={`tel:${t.emergencyContactPhone}`} className="text-gold-dark">{t.emergencyContactPhone}</a></>}
              </p>
            )}
          </div>
          <div className="text-body text-gray-500 text-right">
            <span className="tabular-nums">{items.filter((i) => i.status).length}</span>
            <span className="text-gray-400"> / {items.length} rated</span>
            {uploadingCount > 0 && (
              <span className="block text-amber-600 text-caption"><Loader2 size={11} className="inline animate-spin" /> {uploadingCount} uploading</span>
            )}
          </div>
        </div>

        {inspection.tenantMoney && <TenantMoneyCard money={inspection.tenantMoney} />}

        {inspection.reviewNote && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-body text-amber-800">
            <strong>From the manager:</strong> {inspection.reviewNote}
          </div>
        )}

        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {rooms.map((r, idx) => {
            const roomItems = items.filter((it) => it.room === r);
            const rated = roomItems.every((it) => it.status);
            const n = photoCounts.get(r) ?? 0;
            const done = rated && n >= minPhotos;
            return (
              <button key={r} type="button" onClick={() => setStep(idx)}
                className={`shrink-0 px-3 py-1.5 text-caption rounded-lg border transition-colors ${
                  step === idx ? "border-gold bg-gold/10 text-gold-dark"
                  : done ? "border-green-200 bg-green-50/50 text-green-700"
                  : "border-gray-200 text-gray-500 hover:border-gold/50"}`}>
                {done && <CheckCircle2 size={11} className="inline mr-1" />}
                {r} <span className="tabular-nums opacity-70">· {Math.min(n, 99)}/{minPhotos}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setStep(rooms.length)}
            className={`shrink-0 px-3 py-1.5 text-caption rounded-lg border transition-colors ${
              step === rooms.length ? "border-gold bg-gold/10 text-gold-dark" : "border-gray-200 text-gray-500 hover:border-gold/50"}`}>
            {inspection.tenant ? "Sign-off" : "Finish"}
          </button>
        </div>
      </Card>

      {currentRoom ? (
        <RoomStep
          room={currentRoom}
          items={items.filter((it) => it.room === currentRoom)}
          photos={photos}
          photoCount={photoCounts.get(currentRoom) ?? 0}
          minPhotos={minPhotos}
          type={type}
          baseline={inspection.baseline}
          onUpdate={update}
          onRemoveItem={(itemId) => setItems((prev) => prev.filter((i) => i.id !== itemId))}
          onRemoveRoom={() => removeRoom(currentRoom)}
          onCapture={capture}
          onDeletePhoto={deletePhoto}
          onAddFeature={(f) => addFeature(currentRoom, f)}
        />
      ) : (
        <Card>
          <h3 className="text-h3 text-header mb-3">{inspection.tenant ? "Sign-off" : "Finish"}</h3>
          <div className="space-y-5">
            <AddRoom onAdd={addRoom} />

            <label className="block">
              <span className="text-body font-medium text-gray-700 block mb-1">{inspection.tenant ? "Issues or complaints the tenant raised" : "Issues to report"}</span>
              <textarea rows={3} value={tenantIssues} onChange={(e) => setTenantIssues(e.target.value)}
                placeholder={inspection.tenant ? "Anything the tenant reported about the unit — the manager gets these by email." : "Anything missing, broken or reported by the guest — the manager gets these by email."}
                className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
            </label>

            <label className="block">
              <span className="text-body font-medium text-gray-700 block mb-1">Overall comments</span>
              <textarea rows={3} value={overallComments} onChange={(e) => setOverallComments(e.target.value)}
                placeholder="General observations, anything not captured above…"
                className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
            </label>

            {inspection.meters.length > 0 && !postStay && (
              <div className="space-y-2">
                <p className="text-body font-medium text-gray-700">
                  {inspection.reportType === "MOVE_IN" ? "Opening meter readings" : inspection.reportType === "MOVE_OUT" ? "Final meter readings" : "Meter readings (optional)"}
                </p>
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {inspection.meters.map((m) => {
                    const v = meterValues[m.meterId] ?? "";
                    const below = v.trim() !== "" && m.lastReading !== null && Number(v) < m.lastReading;
                    return (
                      <div key={m.meterId} className="px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-body text-header min-w-0 truncate">{m.label}</span>
                          <input type="text" inputMode="decimal" value={v} placeholder="Reading"
                            onChange={(e) => setMeterValues((prev) => ({ ...prev, [m.meterId]: e.target.value.replace(/[^0-9.]/g, "") }))}
                            className="w-32 text-right border border-gray-200 rounded-lg text-body px-3 py-1.5 bg-cream/50 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold/40" />
                        </div>
                        <p className={`text-caption mt-0.5 ${below ? "text-amber-700" : "text-gray-400"}`}>
                          {m.lastReading !== null ? `Last reading ${m.lastReading}` : "No earlier reading"}
                          {below ? " — this is lower; check you read the right meter" : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <KeysEditor reportType={inspection.reportType} state={keysState} keys={keys} onSave={saveKeys} saving={savingKeys}
              onClearKeys={isManager ? clearKeys : undefined} clearing={clearingKeys} />

            {inspection.tenant && (
              <div className="space-y-3">
                <p className="text-body font-medium text-gray-700">Tenant sign-off</p>
                <div className="grid grid-cols-3 gap-2">
                  {([["SIGNED", "Signed"], ["ABSENT", "Not present"], ["REFUSED", "Won't sign"]] as [TenantSignOff, string][]).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setSignOff(v)}
                      className={`text-body px-2 py-2 rounded-lg border transition-colors ${signOff === v ? "border-gold bg-gold/10 text-gold-dark font-medium" : "border-gray-200 text-gray-500"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {signOff === "SIGNED" && (
                  <div className="space-y-2">
                    <input type="text" value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder="Name of the person signing"
                      className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
                    {signatureUrl && !signatureBlob ? (
                      <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 flex items-center justify-between gap-3">
                        {signatureUrl.startsWith("http")
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={signatureUrl} alt="Tenant signature" className="h-16 object-contain" />
                          : <span className="text-body text-green-700">Signature saved</span>}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSignatureUrl(null)}>Sign again</Button>
                      </div>
                    ) : (
                      <>
                        <SignaturePad onChange={setSignatureBlob} disabled={savingSig} />
                        <Button type="button" size="sm" onClick={saveSignature} loading={savingSig} disabled={!signatureBlob}>Save signature</Button>
                      </>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-2 text-body text-gray-700">
                  <input type="checkbox" checked={disagrees} onChange={(e) => setDisagrees(e.target.checked)} />
                  The tenant disagrees with part of this report
                </label>
                {(disagrees || tenantComments) && (
                  <textarea rows={3} value={tenantComments} onChange={(e) => setTenantComments(e.target.value)}
                    placeholder="What the tenant said, in their words"
                    className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
                )}
              </div>
            )}

            {problems.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-body font-medium text-amber-800 flex items-center gap-1.5"><AlertTriangle size={14} /> Before you hand it in</p>
                <ul className="mt-1 list-disc pl-5 text-caption text-amber-800 space-y-0.5">
                  {problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {isManager ? (
                <Button onClick={() => submit(true)} loading={submitting} disabled={problems.length > 0 || uploadingCount > 0}>
                  <CheckCircle2 size={14} /> Submit &amp; accept
                </Button>
              ) : (
                <Button onClick={() => submit(false)} loading={submitting} disabled={problems.length > 0 || uploadingCount > 0}>
                  <Send size={14} /> Hand in for review
                </Button>
              )}
            </div>
            <p className="text-caption text-gray-400 text-right">
              Once handed in, the findings are locked. You can still record keys.
            </p>
          </div>
        </Card>
      )}

      <Card className="!p-3">
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={14} /> Prev
          </Button>
          <Button variant="primary" size="sm" onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))} disabled={step >= totalSteps - 1}>
            Next <ChevronRight size={14} />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function RoomStep({ room, items, photos, photoCount, minPhotos, type, baseline, onUpdate, onRemoveItem, onRemoveRoom, onCapture, onDeletePhoto, onAddFeature }: {
  room: string;
  items: InspectionItem[];
  photos: PhotoState[];
  photoCount: number;
  minPhotos: number;
  type: InspectionType;
  baseline: InspectionDto["baseline"];
  onUpdate: (itemId: string, patch: Partial<InspectionItem>) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveRoom: () => void;
  onCapture: (itemId: string, file: File) => void;
  onDeletePhoto: (localId: string) => void;
  onAddFeature: (feature: string) => void;
}) {
  const [newFeature, setNewFeature] = useState("");
  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-h3 text-header">{room}</h3>
        <button type="button" onClick={onRemoveRoom} className="text-caption text-gray-400 hover:text-red-500">Remove room</button>
      </div>
      <p className={`text-caption mb-4 ${photoCount >= minPhotos ? "text-green-700" : "text-amber-700"}`}>
        {photoCount} of {minPhotos} photo{minPhotos === 1 ? "" : "s"} for this room
        {type === "POST_STAY" ? " — and a photo of anything damaged" : ""}
      </p>
      <div className="space-y-4">
        {items.map((item) => {
          const itemPhotos = photos.filter((p) => p.itemId === item.id);
          const before = baselineFor(baseline, item.room, item.feature);
          return (
            <div key={item.id} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-body font-medium text-header">{item.feature}</p>
                <button type="button" onClick={() => onRemoveItem(item.id)} className="p-1 text-gray-300 hover:text-red-500" title="Remove feature">
                  <X size={14} />
                </button>
              </div>
              {before && (
                <p className="text-caption text-gray-500 mt-0.5">
                  {baselineLabel(type)}: <span className="font-medium">{itemStatusLabel(type, before.status)}</span>{before.notes ? ` — ${before.notes}` : ""}
                </p>
              )}
              <div className={`grid ${type === "POST_STAY" ? "grid-cols-2" : "grid-cols-4"} gap-1.5 mt-2`}>
                {ratingOptions(type).map(({ value: s, label }) => (
                  <button key={s} type="button" onClick={() => onUpdate(item.id, { status: s })}
                    className={`text-caption px-2 py-1.5 rounded-lg border transition-colors ${item.status === s ? statusClass(s) : "border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <input type="text" placeholder={type === "POST_STAY" && item.status === "POOR" ? "What is damaged? (required)" : "Notes (optional)"} value={item.notes ?? ""} onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
                className="w-full mt-2 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <PhotoButton onCapture={(f) => onCapture(item.id, f)} />
                {itemPhotos.map((p) => (
                  <div key={p.localId} className="relative w-14 h-14 rounded overflow-hidden border border-gray-200">
                    {p.previewUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.previewUrl} alt={p.fileName} className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-gray-100" />}
                    {p.status === "uploading" && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 size={14} className="text-white animate-spin" /></div>
                    )}
                    {p.status === "error" && (
                      <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center text-white text-label">Failed</div>
                    )}
                    <button type="button" onClick={() => onDeletePhoto(p.localId)} className="absolute top-0 right-0 bg-black/60 text-white rounded-bl px-1" aria-label="Delete photo">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-2 pt-2">
          <input type="text" value={newFeature} onChange={(e) => setNewFeature(e.target.value)} placeholder="Add a feature (e.g. AC unit)"
            className="flex-1 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
          <Button type="button" variant="ghost" size="sm" onClick={() => { onAddFeature(newFeature); setNewFeature(""); }}>
            <Plus size={14} /> Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AddRoom({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add another room (e.g. Garage)"
        className="flex-1 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
      <Button type="button" variant="ghost" size="sm" onClick={() => { onAdd(name); setName(""); }}>
        <Plus size={14} /> Add room
      </Button>
    </div>
  );
}

function PhotoButton({ onCapture }: { onCapture: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); if (ref.current) ref.current.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} title="Take a photo"
        className="flex items-center justify-center w-14 h-14 border-2 border-dashed border-gray-300 rounded text-gray-400 hover:border-gold hover:text-gold transition-colors">
        <Camera size={18} />
      </button>
    </>
  );
}

export function statusClass(s: ItemStatus) {
  switch (s) {
    case "PERFECT": return "border-green-300 bg-green-50 text-green-700";
    case "GOOD":    return "border-blue-300 bg-blue-50 text-blue-700";
    case "FAIR":    return "border-amber-300 bg-amber-50 text-amber-700";
    case "POOR":    return "border-red-300 bg-red-50 text-red-700";
  }
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
