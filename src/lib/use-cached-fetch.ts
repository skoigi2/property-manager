"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CachedEntry<T> {
  data: T;
  storedAt: number;
}

interface UseCachedFetchResult<T> {
  /** The most recently known good response — null until the first fetch completes for a cold key. */
  data: T | null;
  /** True only while the *first* fetch for a cold cache is in flight. A background refresh
   *  on a warm cache does NOT flip this back to true. Use it to gate the initial spinner. */
  loading: boolean;
  /** Force an immediate refresh; updates `data` and the cache when it resolves. */
  refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate fetch backed by sessionStorage.
 *
 * - On mount, synchronously hydrates from `sessionStorage["cache:<key>"]` if present so
 *   the UI renders the previous response instantly on repeat navigations (no spinner).
 * - In parallel, fires `fetch(url)`. On success, updates `data` and writes back to cache.
 * - If the cached entry is older than `ttlMs`, the cached render still appears immediately,
 *   but is treated as stale — the background fetch is the source of truth and a failure
 *   does not surface a loading state (the user keeps seeing the last-known-good value).
 * - `key` is the cache slot — pass the URL plus any query params (e.g. `"dashboard:2026-05:all"`).
 *
 * Note: sessionStorage is per-tab. Closing the tab clears the cache. For cross-tab
 * persistence consider localStorage, but the trade-off is staler data after long absences.
 */
export function useCachedFetch<T>(
  key: string,
  url: string,
  ttlMs: number = 60_000,
): UseCachedFetchResult<T> {
  const storageKey = `cache:${key}`;

  // Synchronous hydration from sessionStorage so the first render already has data.
  const initialEntry = readCache<T>(storageKey);
  const [data, setData] = useState<T | null>(initialEntry?.data ?? null);
  const [loading, setLoading] = useState<boolean>(initialEntry === null);

  // Hold the current url in a ref so refresh() always fetches the latest, not a stale capture.
  const urlRef = useRef(url);
  urlRef.current = url;

  const fetchAndStore = useCallback(async () => {
    try {
      const res = await fetch(urlRef.current);
      if (!res.ok) {
        // On error, do not overwrite cached data — keep the last good value visible.
        return;
      }
      const next = (await res.json()) as T;
      setData(next);
      writeCache<T>(storageKey, next);
    } catch {
      // Network failure — same policy as a non-2xx: keep last known good.
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  // Re-fetch whenever url or key changes; also re-runs on remount.
  useEffect(() => {
    // If hydrated and within TTL, still kick off a background refresh (stale-while-revalidate).
    fetchAndStore();
  }, [fetchAndStore, key]);

  // Periodically re-validate the cache so a long-open tab doesn't show wildly stale data.
  // We don't poll aggressively — the TTL is the budget.
  useEffect(() => {
    const id = setInterval(() => {
      const entry = readCache<T>(storageKey);
      if (!entry || Date.now() - entry.storedAt > ttlMs) {
        fetchAndStore();
      }
    }, ttlMs);
    return () => clearInterval(id);
  }, [fetchAndStore, storageKey, ttlMs]);

  return { data, loading, refresh: fetchAndStore };
}

function readCache<T>(key: string): CachedEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry<T>;
    if (typeof parsed?.storedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ data, storedAt: Date.now() } satisfies CachedEntry<T>));
  } catch {
    // Quota errors swallowed — caching is a perf optimization, not load-bearing.
  }
}
