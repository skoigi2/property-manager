"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CheckCircle2, Undo2, Mail, FileDown, PencilLine, Trash2, AlertTriangle } from "lucide-react";
import { INSPECTION_TYPE_LABEL, INSPECTION_STATUS_LABEL, itemStatusLabel, type InspectionKey, type InspectionAction } from "@/lib/inspection-rules";
import { KeysEditor } from "./KeysEditor";
import { statusClass } from "./InspectionWalkthrough";
import { baselineFor, baselineLabel, readError, type InspectionDto } from "./types";
import { TenantMoneyCard } from "./TenantMoneyCard";
import { RepairJobsPanel } from "./RepairJobsPanel";

type NoteDialog = { action: InspectionAction; title: string; label: string; required: boolean; confirm: string } | null;

export function InspectionReview({ inspection, onChanged }: { inspection: InspectionDto; onChanged: (next: InspectionDto) => void }) {
  const router = useRouter();
  const r = inspection;
  const isManager = r.viewer.isManager;
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<NoteDialog>(null);
  const [note, setNote] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keys, setKeys] = useState<InspectionKey[]>(r.keys);

  async function post(path: string, body: unknown, label: string, success: string) {
    setBusy(label);
    try {
      const res = await fetch(`/api/condition-reports/${r.id}/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) { toast.error(await readError(res, "That didn't work — try again")); return false; }
      const data = await res.json();
      toast.success(success);
      onChanged(data.inspection ?? data);
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: InspectionAction, n: string | null, success: string) {
    return post("actions", { action, note: n }, action, success);
  }

  async function saveKeys(next: InspectionKey[]) {
    setKeys(next);
    const res = await fetch(`/api/condition-reports/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: next }),
    });
    if (!res.ok) toast.error(await readError(res, "Couldn't save the keys"));
  }

  async function remove() {
    const res = await fetch(`/api/condition-reports/${r.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error(await readError(res, "Couldn't delete the inspection")); return; }
    toast.success("Inspection deleted");
    router.push("/inspections");
  }

  const groups: { room: string; items: InspectionDto["items"] }[] = [];
  for (const it of r.items) {
    const g = groups.find((x) => x.room === it.room);
    if (g) g.items.push(it); else groups.push({ room: it.room, items: [it] });
  }
  const photoById = new Map(r.photos.map((p) => [p.id, p]));
  const damaged = r.items.filter((i) => i.status === "POOR").length;
  const canRequestEdit = !isManager && (r.status === "SUBMITTED" || r.status === "ACCEPTED") && !r.editRequestedAt;

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h2 className="text-h3 text-header">{INSPECTION_TYPE_LABEL[r.reportType]} inspection · Unit {r.unit.unitNumber}</h2>
            <p className="text-body text-gray-500">{r.property.name}{r.tenant ? ` · ${r.tenant.name}` : ""}</p>
            {r.booking && (
              <p className="text-caption text-gray-500 mt-1">
                Stay {format(new Date(r.booking.checkIn), "d MMM")} – {format(new Date(r.booking.checkOut), "d MMM")}
                {r.booking.guestName ? ` · ${r.booking.guestName}` : ""}
                {" · "}<a href={`/stays/${r.booking.id}`} className="text-gold-dark">Open the stay</a>
              </p>
            )}
            <p className="text-caption text-gray-400 mt-1">
              {r.submittedAt ? `Handed in by ${r.submittedByName ?? "—"} on ${format(new Date(r.submittedAt), "d MMM yyyy, HH:mm")}` : ""}
              {r.acceptedAt ? ` · Accepted ${format(new Date(r.acceptedAt), "d MMM yyyy")}` : ""}
              {r.sentToTenantAt ? ` · Sent to tenant ${format(new Date(r.sentToTenantAt), "d MMM yyyy")}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={r.status === "ACCEPTED" ? "green" : "amber"}>{INSPECTION_STATUS_LABEL[r.status]}</Badge>
            {damaged > 0 && <Badge variant="red">{damaged} damaged</Badge>}
          </div>
        </div>

        {r.tenantMoney && <TenantMoneyCard money={r.tenantMoney} />}

        {r.editRequestedAt && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-body text-red-800">
            <strong>Correction requested:</strong> {r.editRequestReason}
            {isManager && (
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => runAction("approve_edit", null, "Reopened for correction")} loading={busy === "approve_edit"}>Approve — reopen it</Button>
                <Button size="sm" variant="ghost" onClick={() => { setNote(""); setDialog({ action: "decline_edit", title: "Decline the correction", label: "Why is it declined?", required: true, confirm: "Decline" }); }}>Decline</Button>
              </div>
            )}
          </div>
        )}
        {r.reviewNote && !r.editRequestedAt && (
          <p className="mt-3 text-caption text-gray-500">Last note from the manager: {r.reviewNote}</p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          {isManager && r.status === "SUBMITTED" && !r.editRequestedAt && (
            <>
              <Button size="sm" onClick={() => post("finalize", {}, "accept", r.tenant ? "Accepted and saved to the tenant's documents" : "Accepted")} loading={busy === "accept"}>
                <CheckCircle2 size={14} /> Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setNote(""); setDialog({ action: "send_back", title: "Send back to the caretaker", label: "What needs to change?", required: true, confirm: "Send back" }); }}>
                <Undo2 size={14} /> Send back
              </Button>
            </>
          )}
          {isManager && r.status === "ACCEPTED" && r.tenant && (
            <Button size="sm" variant="ghost" onClick={() => { setMessage(""); setSendOpen(true); }} disabled={!r.tenant.email}
              title={r.tenant.email ? undefined : "The tenant has no email address"}>
              <Mail size={14} /> {r.sentToTenantAt ? "Send to tenant again" : "Send to tenant"}
            </Button>
          )}
          <a href={`/api/condition-reports/${r.id}/pdf`} className="inline-flex">
            <Button size="sm" variant="ghost"><FileDown size={14} /> PDF</Button>
          </a>
          {canRequestEdit && (
            <Button size="sm" variant="ghost" onClick={() => { setNote(""); setDialog({ action: "request_edit", title: "Ask to correct this report", label: "What do you need to correct?", required: true, confirm: "Send request" }); }}>
              <PencilLine size={14} /> Request a correction
            </Button>
          )}
          {isManager && r.status !== "ACCEPTED" && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</Button>
          )}
        </div>
      </Card>

      {(r.keysState === "open" || r.keysState === "waiting" || keys.length > 0) && r.reportType !== "MID_TERM" && (
        <Card>
          {r.keysState === "locked" ? (
            <div>
              <p className="text-body font-medium text-gray-700 mb-1">{r.reportType === "MOVE_OUT" ? "Keys returned" : "Keys handed over"}</p>
              {keys.length ? keys.map((k) => <p key={k.label} className="text-body text-gray-600">{k.label}: {k.count}</p>) : <p className="text-body text-gray-400">None recorded</p>}
            </div>
          ) : (
            <KeysEditor reportType={r.reportType} state={r.keysState} keys={keys} onSave={saveKeys}
              onClearKeys={isManager ? () => runAction("clear_keys", null, "Keys cleared — the caretaker has been told") : undefined}
              clearing={busy === "clear_keys"} />
          )}
        </Card>
      )}

      <RepairJobsPanel inspection={r} onChanged={onChanged} />

      {r.meterReadings.length > 0 && (
        <Card>
          <p className="text-body font-medium text-gray-700 mb-1">
            {r.reportType === "MOVE_IN" ? "Opening meter readings" : r.reportType === "MOVE_OUT" ? "Final meter readings" : "Meter readings"}
          </p>
          {r.meterReadings.map((m) => (
            <p key={m.meterId} className="text-body text-gray-600 tabular-nums">
              {m.label}: {m.reading}
              {m.lastReading !== null && <span className={m.reading < m.lastReading ? "text-amber-700" : "text-gray-400"}> (last {m.lastReading})</span>}
            </p>
          ))}
        </Card>
      )}

      {(r.tenantIssues || r.tenantComments || r.tenantSignOff) && (
        <Card>
          <div className="space-y-3">
            {r.tenantIssues && (
              <div>
                <p className="text-body font-medium text-amber-700 flex items-center gap-1.5"><AlertTriangle size={14} /> {r.tenant ? "Issues the tenant raised" : "Issues reported"}</p>
                <p className="text-body text-gray-700 whitespace-pre-wrap mt-1">{r.tenantIssues}</p>
              </div>
            )}
            {r.tenantSignOff && (
              <div>
                <p className="text-body font-medium text-gray-700">Tenant sign-off</p>
                {r.tenantSignOff === "SIGNED" ? (
                  <div className="flex items-center gap-3 mt-1">
                    {r.tenantSignatureUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.tenantSignatureUrl} alt="Tenant signature" className="h-14 object-contain border border-gray-100 rounded bg-white" />
                    )}
                    <p className="text-body text-gray-600">
                      {r.tenantSignedName}{r.tenantSignedAt ? `, ${format(new Date(r.tenantSignedAt), "d MMM yyyy HH:mm")}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-body text-gray-600 mt-1">{r.tenantSignOff === "ABSENT" ? "The tenant was not present." : "The tenant declined to sign."}</p>
                )}
              </div>
            )}
            {(r.tenantDisagrees || r.tenantComments) && (
              <div>
                <p className="text-body font-medium text-gray-700">{r.tenantDisagrees ? "The tenant disagrees" : "Tenant's comments"}</p>
                <p className="text-body text-gray-700 whitespace-pre-wrap mt-1">{r.tenantComments || "—"}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.room}>
          <h3 className="text-h3 text-header mb-3">{g.room}</h3>
          <div className="space-y-3">
            {g.items.map((it) => {
              const before = baselineFor(r.baseline, it.room, it.feature);
              const changed = before?.status && it.status && before.status !== it.status;
              return (
                <div key={it.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-body font-medium text-header">{it.feature}</p>
                    {it.status && <span className={`text-caption px-2 py-0.5 rounded-lg border ${statusClass(it.status)}`}>{itemStatusLabel(r.reportType, it.status)}</span>}
                  </div>
                  {before && (
                    <p className={`text-caption mt-0.5 ${changed ? "text-amber-700" : "text-gray-400"}`}>
                      {baselineLabel(r.reportType)}: {itemStatusLabel(r.reportType, before.status)}{before.notes ? ` — ${before.notes}` : ""}
                    </p>
                  )}
                  {it.notes && <p className="text-body text-gray-600 mt-1">{it.notes}</p>}
                  {it.photoIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {it.photoIds.map((pid) => {
                        const p = photoById.get(pid);
                        if (!p?.url) return null;
                        return (
                          <a key={pid} href={p.url} target="_blank" rel="noreferrer" className="block w-20 h-20 rounded overflow-hidden border border-gray-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={`${it.room} — ${it.feature}`} className="w-full h-full object-cover" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {r.overallComments && (
        <Card>
          <p className="text-body font-medium text-gray-700">Overall comments</p>
          <p className="text-body text-gray-700 whitespace-pre-wrap mt-1">{r.overallComments}</p>
        </Card>
      )}

      <Modal open={!!dialog} onClose={() => setDialog(null)} title={dialog?.title ?? ""}>
        <div className="space-y-3">
          <label className="block">
            <span className="text-body font-medium text-gray-700 block mb-1">{dialog?.label}</span>
            <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              disabled={!!dialog?.required && !note.trim()}
              loading={!!dialog && busy === dialog.action}
              onClick={async () => {
                if (!dialog) return;
                const success = dialog.action === "send_back" ? "Sent back to the caretaker"
                  : dialog.action === "request_edit" ? "Request sent to the manager" : "Correction declined";
                if (await runAction(dialog.action, note.trim() || null, success)) setDialog(null);
              }}
            >
              {dialog?.confirm}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title="Send the report to the tenant">
        <div className="space-y-3">
          <p className="text-body text-gray-600">
            {r.tenant?.name} gets the PDF with the photos at {r.tenant?.email}. The email is logged on their Comms tab.
          </p>
          <label className="block">
            <span className="text-body font-medium text-gray-700 block mb-1">Message (optional)</span>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={r.tenantDisagrees ? "e.g. We've noted your comments on the kitchen and will reply separately." : ""}
              className="w-full border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button loading={busy === "send"} onClick={async () => {
              if (await post("send", { message: message.trim() || null }, "send", "Report emailed to the tenant")) setSendOpen(false);
            }}>
              <Mail size={14} /> Send
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this inspection?"
        message="Its photos and signature are deleted too. This can't be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
