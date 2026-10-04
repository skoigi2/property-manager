/// <reference lib="webworker" />
// Service worker source (Serwist), built to public/sw.js by @serwist/next.
//
// Offline is deliberately limited to the Utilities page, where caretakers read
// meters with no signal. The worker is registered by that page only, scoped to
// /utilities (src/app/(dashboard)/utilities/page.tsx); nothing else in the app
// is served from a cache, so money figures are never stale. Before widening it,
// weigh stale financial data and shared office PCs. The month's readings
// offline come from the copy the page keeps on the phone
// (src/lib/offline-readings.ts), not from this worker.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Filled in at build time: the app's JS/CSS chunks plus the manifest and
    // icons (globPublicPatterns in next.config.mjs).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const WEEK = 7 * 24 * 60 * 60;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // The Utilities page and its RSC payloads: the last copy opens offline.
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        url.pathname.startsWith("/utilities") &&
        (request.mode === "navigate" || request.headers.get("RSC") === "1"),
      handler: new NetworkFirst({
        cacheName: "pages-offline",
        networkTimeoutSeconds: 8,
        plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: WEEK })],
      }),
    },
    // Who is signed in and which properties they see, so the page still
    // renders offline. Network always wins when there is one.
    {
      matcher: /\/api\/(auth\/session|properties\?minimal=true)/,
      handler: new NetworkFirst({
        cacheName: "session-offline",
        networkTimeoutSeconds: 8,
        plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: WEEK })],
      }),
    },
  ],
});

// The next-pwa worker this replaced precached into "workbox-precache-v2-…"
// (including every tutorial video) — drop it from phones that still have it.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("workbox-precache")).map((k) => caches.delete(k)))),
  );
});

serwist.addEventListeners();
