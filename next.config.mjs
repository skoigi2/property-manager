// @ts-check
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
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

export default withPWA(nextConfig);
