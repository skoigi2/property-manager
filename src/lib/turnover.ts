// Pure rules for the "ready to re-let" checklist (UnitTurnover) and for the
// repair jobs raised from inspection damage. Prisma side: src/lib/turnover-data.ts.
//
// A checklist is started when a checkout is finalised (or by hand from a
// move-out inspection). Most items are ticked by people on site; two follow
// the records: "Repairs done" ticks itself once every repair job raised from
// the inspection is DONE or CANCELLED, and "Deposit settled" follows the
// finalised checkout. It is complete when every item is done.

export type TurnoverItemKey = "keys" | "meters" | "repairs" | "deposit" | "cleaned" | "checked" | "listed";

export interface TurnoverItem {
  key: TurnoverItemKey;
  label: string;
  done: boolean;
  doneAt: string | null;
  doneByName: string | null;
}

export const TURNOVER_ITEMS: { key: TurnoverItemKey; label: string; auto?: boolean }[] = [
  { key: "keys",    label: "Keys collected from the tenant" },
  { key: "meters",  label: "Final meter readings taken" },
  { key: "repairs", label: "Repairs done", auto: true },
  { key: "deposit", label: "Deposit settled", auto: true },
  { key: "cleaned", label: "Unit cleaned" },
  { key: "checked", label: "Final walk-through: ready for a new tenant" },
  { key: "listed",  label: "Listed for letting" },
];

export function defaultTurnoverItems(done: Partial<Record<TurnoverItemKey, boolean>> = {}, byName: string | null = null, at = new Date()): TurnoverItem[] {
  return TURNOVER_ITEMS.map((t) => ({
    key: t.key,
    label: t.label,
    done: !!done[t.key],
    doneAt: done[t.key] ? at.toISOString() : null,
    doneByName: done[t.key] ? byName : null,
  }));
}

export function normaliseTurnoverItems(raw: unknown): TurnoverItem[] {
  const stored = Array.isArray(raw) ? (raw as Partial<TurnoverItem>[]) : [];
  return TURNOVER_ITEMS.map((t) => {
    const s = stored.find((x) => x?.key === t.key);
    return {
      key: t.key,
      label: t.label,
      done: !!s?.done,
      doneAt: s?.done ? (s.doneAt ?? null) : null,
      doneByName: s?.done ? (s.doneByName ?? null) : null,
    };
  });
}

export type RepairJobsState = { total: number; open: number };

export type ToggleDecision = { ok: true } | { ok: false; status: number; error: string };

/** "Repairs done" can't be ticked while repair jobs are still open; "Deposit settled" follows the checkout. */
export function decideTurnoverToggle(
  key: TurnoverItemKey,
  done: boolean,
  ctx: { repairs: RepairJobsState; depositSettled: boolean; completed: boolean },
): ToggleDecision {
  if (ctx.completed) return { ok: false, status: 409, error: "This checklist is complete." };
  if (key === "repairs" && done && ctx.repairs.open > 0) {
    return { ok: false, status: 409, error: `${ctx.repairs.open} repair job${ctx.repairs.open === 1 ? " is" : "s are"} still open.` };
  }
  if (key === "deposit" && done !== ctx.depositSettled && ctx.depositSettled) {
    return { ok: false, status: 409, error: "The deposit was settled at checkout." };
  }
  return { ok: true };
}

export function setTurnoverItem(items: TurnoverItem[], key: TurnoverItemKey, done: boolean, byName: string | null, at = new Date()): TurnoverItem[] {
  return items.map((i) => (i.key === key ? { ...i, done, doneAt: done ? at.toISOString() : null, doneByName: done ? byName : null } : i));
}

/** The items as shown: auto items reflect the records (repair jobs, checkout). */
export function effectiveTurnoverItems(items: TurnoverItem[], ctx: { repairs: RepairJobsState; depositSettled: boolean }): TurnoverItem[] {
  return items.map((i) => {
    if (i.key === "repairs" && ctx.repairs.total > 0) return { ...i, done: ctx.repairs.open === 0 };
    if (i.key === "deposit" && ctx.depositSettled) return { ...i, done: true };
    return i;
  });
}

export function turnoverProgress(items: TurnoverItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}

// ── Repair jobs from inspection damage ──────────────────────────────────────

/** A sensible maintenance category for a damaged feature (the manager can change it). */
export function repairCategoryFor(feature: string, room = ""): "PLUMBING" | "ELECTRICAL" | "APPLIANCE" | "PAINTING" | "STRUCTURAL" | "OTHER" {
  const f = `${feature} ${room}`.toLowerCase();
  if (/tap|sink|toilet|shower|bath|drain|pipe|geyser|water heater|plumb/.test(f)) return "PLUMBING";
  if (/light|socket|switch|electric|wiring|power/.test(f)) return "ELECTRICAL";
  if (/appliance|cooker|oven|fridge|washing|microwave|ac unit|air con/.test(f)) return "APPLIANCE";
  if (/wall|paint|ceiling/.test(f)) return "PAINTING";
  if (/floor|door|window|railing|cabinet|wardrobe|countertop|tile/.test(f)) return "STRUCTURAL";
  return "OTHER";
}
