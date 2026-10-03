// Next.js instrumentation hook — loads the per-runtime Sentry config on boot.
// The browser side lives in src/instrumentation-client.ts.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Errors thrown in server components, route handlers and middleware reach
// Sentry through Next 15's request-error hook.
export const onRequestError = Sentry.captureRequestError;
