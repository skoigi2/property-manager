/**
 * Tenant portal messages in the Inbox — pure rules (tested).
 *
 * A thread needs the manager when it isn't RESOLVED and its latest message is
 * the tenant's. It waits from the FIRST tenant message the manager hasn't
 * answered yet (a tenant writing again doesn't reset the clock), and becomes
 * URGENT after URGENT_AFTER_DAYS without a reply.
 */
export const URGENT_AFTER_DAYS = 2;

export interface MessageLike {
  sender: "TENANT" | "MANAGER" | string;
  createdAt: Date | string;
}

/** When the tenant started waiting for a reply, or null if the manager spoke last. */
export function unansweredSince(messages: MessageLike[]): Date | null {
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let since: Date | null = null;
  for (const m of sorted) {
    if (m.sender === "TENANT") since = since ?? new Date(m.createdAt);
    else since = null; // a manager reply answers everything before it
  }
  return since;
}

/** Whole days the tenant has been waiting. */
export function daysWaiting(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}

export function tenantMessageSeverity(since: Date, now: Date = new Date()): "URGENT" | "WARNING" {
  return daysWaiting(since, now) >= URGENT_AFTER_DAYS ? "URGENT" : "WARNING";
}

/** Deep link to the conversation on the tenant page (Portal Msgs tab, thread open). */
export function tenantMessageHref(tenantId: string, threadId: string): string {
  return `/tenants/${tenantId}?tab=messages&thread=${threadId}`;
}
