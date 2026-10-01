// @ts-check
import withPWAInit from "next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

// Offline caching is deliberately limited to the Utilities page, where
// caretakers read meters with no signal. The worker is registered by that page
// only, scoped to /utilities (src/app/(dashboard)/utilities/page.tsx); nothing
// else in the app is served from a cache, so money figures are never stale.
// Before widening it, weigh stale financial data and shared office PCs.
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // Registered by the Utilities page itself (next-pwa's own registration never
  // ran under the App Router — and must not start registering at scope "/").
  register: false,
  skipWaiting: true,
  // Files the server never hands the worker: the App Router build manifest
  // (behind the auth middleware → redirect) and source maps (not served).
  // Precaching either fails the whole install.
  buildExcludes: [/app-build-manifest\.json$/, /\.map$/],
  runtimeCaching: [
    // The Utilities page and its RSC payloads: the last copy opens offline.
    // The month's readings themselves come from the copy the page keeps on
    // the phone (src/lib/offline-readings.ts), not from this cache.
    {
      urlPattern: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        url.pathname.startsWith("/utilities") &&
        (request.mode === "navigate" || request.headers.get("RSC") === "1"),
      handler: "NetworkFirst",
      options: {
        cacheName: "pages-offline",
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // Who is signed in and which properties they see, so the page still
    // renders offline. Network always wins when there is one.
    {
      urlPattern: /\/api\/(auth\/session|properties\?minimal=true)/,
      handler: "NetworkFirst",
      options: {
        cacheName: "session-offline",
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

// Baseline security headers applied to every response. Keep CSP off (or in
// Report-Only) for now to avoid breaking Paddle/Resend/Supabase JS in production
// — turn it on after a soak window where we can review violations.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app never uses next/image, so the image optimiser endpoint is switched
  // off: several Next 14 advisories (incl. a critical one) sit in it, and 14.x
  // gets no more patches.
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
    instrumentationHook: true, // loads src/instrumentation.ts (Sentry server init)
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry wrapping is inert without SENTRY_AUTH_TOKEN (skips source-map upload)
// and the SDK no-ops without NEXT_PUBLIC_SENTRY_DSN — safe in all environments.
export default withSentryConfig(withPWA(nextConfig), {
  silent: true,
  disableLogger: true,
});
