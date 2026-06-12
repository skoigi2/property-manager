"use client";

// Root-level React render-error boundary. Reports to Sentry (no-op without a
// DSN) and shows a minimal recovery screen. Must render its own <html>/<body>
// because it replaces the root layout when triggered.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          The error has been logged. Please try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "6px",
            border: "1px solid #ccc",
            background: "#132635",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
