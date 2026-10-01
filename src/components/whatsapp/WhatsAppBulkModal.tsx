"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { WhatsAppSendButton } from "./WhatsAppSendButton";
import { loadWhatsAppTarget, whatsAppMessageFor, type WhatsAppTarget } from "./use-whatsapp";
import type { InboxItem } from "@/lib/inbox";

interface Step {
  /** Inbox item ids this chat covers (one tenant). */
  itemIds: string[];
  label: string;
  target: WhatsAppTarget | null;
  error?: string;
}

/**
 * Inbox bulk "Remind on WhatsApp": steps through the selected overdue items
 * one tenant at a time — each chat opens from its own tap (browsers won't
 * open a batch of tabs at once). A tenant with several selected invoices gets
 * one message covering all their open invoices. Tenants without a usable
 * phone are skipped and listed at the end.
 */
export function WhatsAppBulkModal({
  items, onClose, onDone,
}: {
  items: InboxItem[];
  onClose: () => void;
  onDone: (processedItemIds: string[]) => void;
}) {
  const groups = useMemo(() => {
    const byTenant = new Map<string, InboxItem[]>();
    for (const it of items) {
      if (!it.tenantId) continue;
      byTenant.set(it.tenantId, [...(byTenant.get(it.tenantId) ?? []), it]);
    }
    return Array.from(byTenant.entries());
  }, [items]);

  const [loaded, setLoaded] = useState(0);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [skippedByYou, setSkippedByYou] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Step[] = [];
      for (const [tenantId, its] of groups) {
        const fallbackLabel = its[0].title.replace(/^Rent overdue — /, "");
        try {
          // One invoice → that invoice's figures; several → all the tenant's open invoices.
          const target = await loadWhatsAppTarget(tenantId, its.length === 1 ? its[0].refId : null);
          const first = target.context.tenantName.split(/\s+/)[0];
          out.push({ itemIds: its.map((i) => i.id), label: `${first} — Unit ${target.context.unitNumber}`, target });
        } catch (e) {
          out.push({ itemIds: its.map((i) => i.id), label: fallbackLabel, target: null, error: e instanceof Error ? e.message : "Failed to load" });
        }
        if (cancelled) return;
        setLoaded((n) => n + 1);
      }
      if (!cancelled) setSteps(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const sendable = (steps ?? []).filter((s) => s.target?.phone.digits);
  const unusable = (steps ?? []).filter((s) => !s.target?.phone.digits);
  const current = sendable[index];
  const finished = steps !== null && index >= sendable.length;

  function next(sent: boolean) {
    if (current) {
      if (sent) {
        setSentIds((ids) => [...ids, ...current.itemIds]);
        setSentCount((n) => n + 1);
      }
      else setSkippedByYou((l) => [...l, current.label]);
    }
    setIndex((i) => i + 1);
  }

  function updateTarget(token: string) {
    setSteps((all) => all && all.map((s) => (s === current && s.target ? { ...s, target: { ...s.target, portalToken: token } } : s)));
  }

  return (
    <Modal open onClose={() => (sentIds.length ? onDone(sentIds) : onClose())} title="Remind on WhatsApp" size="md">
      <div className="p-5 space-y-4">
        {steps === null ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner />
            <p className="text-caption text-gray-500">Loading {Math.min(loaded + 1, groups.length)} of {groups.length}…</p>
          </div>
        ) : !finished && current ? (
          <>
            <p className="text-body text-header">
              <span className="font-medium">Next: {current.label}</span>
              <span className="text-gray-400"> · {index + 1} of {sendable.length}</span>
            </p>
            <p className="whitespace-pre-wrap break-words text-caption text-gray-700 bg-cream rounded-xl p-3 max-h-56 overflow-y-auto">
              {whatsAppMessageFor(current.target!, "rent_reminder")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <WhatsAppSendButton
                key={current.label}
                target={current.target}
                template="rent_reminder"
                variant="gold"
                onPortalCreated={updateTarget}
                onSent={() => next(true)}
              />
              <Button variant="ghost" onClick={() => next(false)}>Skip</Button>
            </div>
            <p className="text-caption text-gray-400">
              Each tap opens one chat — send it in WhatsApp, come back, and tap for the next tenant.
            </p>
          </>
        ) : (
          <>
            <p className="text-body text-header">
              {sentCount > 0
                ? `Opened WhatsApp for ${sentCount} tenant${sentCount === 1 ? "" : "s"} — each is logged on their Comms tab as a send attempt.`
                : "No WhatsApp chats were opened."}
            </p>
            {skippedByYou.length > 0 && (
              <div>
                <p className="text-label text-gray-400 uppercase">Skipped by you</p>
                <ul className="text-caption text-gray-600 list-disc list-inside">
                  {skippedByYou.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}
            {unusable.length > 0 && (
              <div>
                <p className="text-label text-gray-400 uppercase">No usable phone number</p>
                <ul className="text-caption text-gray-600 list-disc list-inside">
                  {unusable.map((s) => (
                    <li key={s.label}>
                      {s.label}
                      {s.error ? ` — ${s.error}` : s.target?.phone.raw ? ` — "${s.target.phone.raw}" needs a country code` : " — no phone on file"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="gold" onClick={() => onDone(sentIds)}>Done</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
