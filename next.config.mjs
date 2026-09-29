// @ts-check
import withPWAInit from "next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Files the server never hands the worker: the App Router build manifest
  // (behind the auth middleware → redirect) and source maps (not served).
  // Precaching either fails the whole install.
  buildExcludes: [/app-build-manifest\.json$/, /\.map$/],
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "supabase-cache",
        expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\/api\/dashboard/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "dashboard-cache",
        expiration: { maxEntries: 10, maxAgeSeconds: 5 * 60 },
      },
    },
    // Offline: the caretaker reads meters where there is no signal. Pages and
    // their RSC payloads fall back to the last copy seen; the session and the
    // property list outlive the 60 s api-cache so an offline app still knows
    // who is signed in. Network always wins when there is one.
    {
      urlPattern: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/_next/") &&
        (request.mode === "navigate" || request.headers.get("RSC") === "1"),
      handler: "NetworkFirst",
      options: {
        cacheName: "pages-offline",
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 40, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\/api\/(auth\/session|properties\?minimal=true)/,
      handler: "NetworkFirst",
      options: {
        cacheName: "session-offline",
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\/api\/.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 },
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
