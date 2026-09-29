"use client";

// Offline meter readings. Meter rooms and basements often have no signal: a
// reading saved there is kept on the phone (IndexedDB — photos included) and
// sent by the same API calls once the phone is back online. The last reading
// sheet loaded per property + month is kept too (localStorage), so the page
// still opens offline. Everything here fails soft: with storage blocked the
// app simply behaves as before (save needs a connection).

const DB_NAME = "gw-offline";
const STORE = "meterReadings";
const SHEET_PREFIX = "gw:utilitiesSheet:";

export interface QueuedReading {
  /** meterId:YYYY-MM — one queued reading per meter and month (a re-save replaces it). */
  key: string;
  propertyId: string;
  meterId: string;
  meterTitle: string;
  periodYear: number;
  periodMonth: number;
  readingDate: string;
  /** Null when only photos were added to an existing reading. */
  currentReading: number | null;
  /** Set when correcting a reading the server already has (PATCH). */
  readingId: string | null;
  photos: Blob[];
  queuedAt: string;
  /** Last send attempt was refused by the server (kept so nothing is lost silently). */
  lastError?: string;
}

export function queueKey(meterId: string, year: number, month: number): string {
  return `${meterId}:${year}-${String(month).padStart(2, "0")}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function queueReading(item: QueuedReading): Promise<void> {
  await withStore("readwrite", (s) => s.put(item));
}

export async function listQueued(propertyId?: string): Promise<QueuedReading[]> {
  try {
    const all = await withStore<QueuedReading[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedReading[]>);
    return all
      .filter((q) => !propertyId || q.propertyId === propertyId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch {
    return [];
  }
}

export async function removeQueued(key: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(key));
  } catch {
    // storage unavailable — nothing to remove
  }
}

/** A failed fetch (no connection) rather than an answer from the server. */
export function isOfflineError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return e instanceof TypeError;
}

/** The request a queued reading becomes — the same calls the Save button makes. */
export function queuedRequest(q: QueuedReading): { url: string; init: RequestInit } {
  const fd = new FormData();
  if (q.currentReading !== null) fd.set("currentReading", String(q.currentReading));
  q.photos.forEach((p, i) => fd.append("photo", p, (p as File).name ?? `meter-${i + 1}.jpg`));
  if (q.readingId) return { url: `/api/utilities/readings/${q.readingId}`, init: { method: "PATCH", body: fd } };
  fd.set("meterId", q.meterId);
  fd.set("periodYear", String(q.periodYear));
  fd.set("periodMonth", String(q.periodMonth));
  fd.set("readingDate", q.readingDate);
  return { url: "/api/utilities/readings", init: { method: "POST", body: fd } };
}

export interface FlushResult {
  sent: number;
  failed: { key: string; meterTitle: string; error: string }[];
  /** Still no connection — the rest stay queued. */
  offline: boolean;
}

let flushing: Promise<FlushResult> | null = null;

/**
 * Sends queued readings oldest first. Stops at the first connection failure;
 * a reading the server refuses (e.g. someone else already read that meter)
 * stays queued with its error so the caretaker can see and discard it.
 */
export function flushQueued(propertyId?: string): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = { sent: 0, failed: [], offline: false };
    try {
      for (const q of await listQueued(propertyId)) {
        const { url, init } = queuedRequest(q);
        let res: Response;
        try {
          res = await fetch(url, init);
        } catch (e) {
          if (isOfflineError(e)) {
            result.offline = true;
            break;
          }
          throw e;
        }
        if (res.ok) {
          await removeQueued(q.key);
          result.sent++;
          continue;
        }
        let error = "The reading could not be saved.";
        try {
          const body = await res.json();
          if (typeof body?.error === "string") error = body.error;
        } catch {
          // not JSON
        }
        await queueReading({ ...q, lastError: error });
        result.failed.push({ key: q.key, meterTitle: q.meterTitle, error });
      }
    } finally {
      flushing = null;
    }
    return result;
  })();
  return flushing;
}

// ─── Last sheet per property + month (so the page opens offline) ─────────────

export function saveSheetSnapshot(propertyId: string, year: number, month: number, sheet: unknown): void {
  try {
    localStorage.setItem(
      `${SHEET_PREFIX}${propertyId}:${year}-${month}`,
      JSON.stringify({ savedAt: new Date().toISOString(), sheet }),
    );
  } catch {
    // storage full or blocked — offline opening just won't have a copy
  }
}

export function loadSheetSnapshot<T>(propertyId: string, year: number, month: number): { savedAt: string; sheet: T } | null {
  try {
    const raw = localStorage.getItem(`${SHEET_PREFIX}${propertyId}:${year}-${month}`);
    return raw ? (JSON.parse(raw) as { savedAt: string; sheet: T }) : null;
  } catch {
    return null;
  }
}
