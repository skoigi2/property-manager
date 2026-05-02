import { prisma } from "@/lib/prisma";

interface AuditOptions {
  userId: string;
  userEmail?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE";
  resource: string;
  resourceId: string;
  organizationId?: string | null;
  before?: object | null;
  after?: object | null;
}

// Field-name patterns that must NEVER be persisted to the audit log, even if a
// caller passes the whole record by accident. Matched case-insensitively as a
// substring of the JSON key.
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwordreset",
  "portaltoken",
  "bankaccountnumber",
  "mpesapaybill",
  "mpesatill",
  "mpesaaccountnumber",
  "vatregistrationnumber",
  "paddlecustomerid",
  "paddlesubscriptionid",
  "paddleeventid",
  "secret",
  "apikey",
  "token",
];

function redact(input: object | null | undefined): object | null | undefined {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((v) => (v && typeof v === "object" ? redact(v as object) : v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (SENSITIVE_KEY_PATTERNS.some((p) => lk.includes(p))) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = redact(v as object);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function logAudit(opts: AuditOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:         opts.userId,
        userEmail:      opts.userEmail ?? null,
        action:         opts.action,
        resource:       opts.resource,
        resourceId:     opts.resourceId,
        organizationId: opts.organizationId ?? null,
        before:         (redact(opts.before) ?? undefined) as object | undefined,
        after:          (redact(opts.after)  ?? undefined) as object | undefined,
      },
    });
  } catch {
    // Audit logging should never break the main operation
  }
}
