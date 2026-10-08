// @ts-check
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

// The public/ files the worker precaches, listed here (not globbed): Serwist's
// glob keeps the OS path separator, so a Windows build would precache
// "/icons\icon-192.png" — a 404 that fails the whole install.
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const precachePublic = ["manifest.json", "favicon.ico", ...readdirSync(publicDir + "icons").map((f) => `icons/${f}`)].map(
  (f) => ({ url: `/${f}`, revision: createHash("md5").update(readFileSync(publicDir + f)).digest("hex") }),
);

// Service worker: src/app/sw.ts, built to public/sw.js. Offline caching is
// deliberately limited to the Utilities page (see the comment in sw.ts).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Registered by the Utilities page itself, scoped to /utilities — never at
  // scope "/" (Serwist's own registration would use the site root).
  register: false,
  // The page replays queued offline readings itself on the `online` event; a
  // forced reload would only interrupt the caretaker.
  reloadOnOnline: false,
  // Precache the app's code plus the manifest and icons. Everything else in
  // public/ (tutorial videos ~33 MB, guide screenshots) stays out — next-pwa
  // used to push all of it onto every caretaker phone.
  additionalPrecacheEntries: precachePublic,
  exclude: [/\.map$/, /^manifest.*\.js$/],
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
  // The app never uses next/image, so the image optimiser endpoint stays off —
  // less attack surface (several past advisories sat in it).
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // @react-pdf/renderer runs server-side only (src/lib/*-pdf.tsx) — keep it out
  // of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // react-pdf ≥ 4.4 renders through upstream pdfkit, which loads its 14
  // standard fonts (Helvetica…) with a runtime require of "#standard-fonts/*".
  // The deploy's file tracing can't see that, so the font files were missing
  // on Vercel and every PDF failed (2026-10-05 → 10-08). Ship them with every
  // API route (PDFs are rendered in routes and the cron).
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/standard-fonts/*.cjs"],
  },
  // No dev badge: the guide screenshots and tutorial videos are captured from
  // `next dev`. Errors still open the overlay.
  devIndicators: false,
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
// With the token (Vercel Production only) each build uploads its source maps to
// Sentry and then deletes them, so they are never served publicly.
export default withSentryConfig(withSerwist(nextConfig), {
  org: "groundwork-pm",
  project: "javascript-nextjs",
  widenClientFileUpload: true,
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
