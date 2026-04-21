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
        before:         opts.before  ?? undefined,
        after:          opts.after   ?? undefined,
      },
    });
  } catch {
    // Audit logging should never break the main operation
  }
}
