import { prisma } from "@/lib/prisma";

/**
 * Validate a magic-link approval token. Returns the request with case + property
 * relations, or null if not found / expired / already EXPIRED.
 *
 * Note: this does NOT mutate state. The POST handler in /api/approvals/[token]
 * is responsible for marking expired tokens as EXPIRED — GET requests must stay
 * idempotent so that email link-preview scanners don't burn tokens.
 */
export async function validateApprovalToken(token: string) {
  const req = await prisma.approvalRequest.findUnique({
    where: { token },
    include: {
      caseThread: {
        include: {
          property: { select: { id: true, name: true, currency: true } },
          unit: { select: { id: true, unitNumber: true } },
        },
      },
      requestedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!req) return null;
  return req;
}

export function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

/** Show only the last 4 chars of a token in logs. */
export function redactToken(token: string): string {
  if (!token || token.length <= 4) return "***";
  return `***${token.slice(-4)}`;
}
