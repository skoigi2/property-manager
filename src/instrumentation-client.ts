// Browser-side Sentry init (Next 15 loads this file on the client before the
// app starts). No-ops entirely until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Keep payloads lean — no session replay (privacy: app shows financial data).
  integrations: [],
});

// Ties client-side navigations to performance traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
