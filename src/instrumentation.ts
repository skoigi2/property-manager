// Next.js instrumentation hook — loads the per-runtime Sentry config on boot.
// Requires experimental.instrumentationHook = true in next.config.mjs (Next 14).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
