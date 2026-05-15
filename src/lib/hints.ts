import type { HintSeverity, HintType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface HintInput {
  organizationId: string;
  propertyId?: string | null;
  unitId?: string | null;
  tenantId?: string | null;
  caseThreadId?: string | null;
  hintType: HintType;
  refId: string;
  severity: HintSeverity;
  title: string;
  subtitle: string;
  suggestedAction?: string;
  actionEndpoint?: string;
  actionMethod?: "POST" | "PATCH" | "GET";
  actionBody?: Prisma.JsonValue;
  actionLabel?: string;
  expiresAt?: Date;
}

/**
 * Upsert a hint keyed by (hintType, refId). Idempotent — safe to call from cron
 * on every run. If a previously DISMISSED hint reappears (condition came back),
 * it is reset to ACTIVE so the user sees it again.
 */
export async function upsertHint(input: HintInput): Promise<void> {
  const base = {
    organizationId: input.organizationId,
    propertyId: input.propertyId ?? null,
    unitId: input.unitId ?? null,
    tenantId: input.tenantId ?? null,
    caseThreadId: input.caseThreadId ?? null,
    severity: input.severity,
    title: input.title,
    subtitle: input.subtitle,
    suggestedAction: input.suggestedAction ?? null,
    actionEndpoint: input.actionEndpoint ?? null,
    actionMethod: input.actionMethod ?? null,
    actionBody: (input.actionBody ?? null) as Prisma.InputJsonValue | typeof Prisma.DbNull,
    actionLabel: input.actionLabel ?? null,
    expiresAt: input.expiresAt ?? null,
  };

  await prisma.actionableHint.upsert({
    where: { hintType_refId: { hintType: input.hintType, refId: input.refId } },
    create: { ...base, hintType: input.hintType, refId: input.refId, status: "ACTIVE" },
    update: {
      ...base,
      // Re-activate previously dismissed/expired hints when the condition recurs.
      status: "ACTIVE",
      dismissedAt: null,
      dismissedByUserId: null,
    },
  });
}

/**
 * Flip any matching hints to ACTED_ON. Called by mutating routes when the
 * underlying condition clears (e.g. invoice marked PAID, lease renewed).
 *
 * Sequential awaits per CLAUDE.md (pgBouncer-safe).
 */
export async function clearHints(refId: string, hintType?: HintType): Promise<void> {
  const where = hintType
    ? { hintType, refId, status: "ACTIVE" as const }
    : { refId, status: "ACTIVE" as const };
  await prisma.actionableHint.updateMany({
    where,
    data: { status: "ACTED_ON", actedAt: new Date() },
  });
}

/** Convenience: clear by multiple hintTypes for the same ref. */
export async function clearHintsAny(refId: string, hintTypes: HintType[]): Promise<void> {
  await prisma.actionableHint.updateMany({
    where: { refId, hintType: { in: hintTypes }, status: "ACTIVE" },
    data: { status: "ACTED_ON", actedAt: new Date() },
  });
}
