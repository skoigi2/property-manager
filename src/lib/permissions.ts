/**
 * Role-based permission map — granular distinctions between roles that pass
 * the same route-level allow-list (see src/lib/auth-utils.ts). Route helpers
 * decide WHICH roles reach a handler; this layer is the finer cut for actions
 * a role that got in must still not perform.
 *
 * Principles:
 * - ACCOUNTANT records and reconciles money but cannot destroy financial
 *   history or drive tenancy lifecycle / org configuration.
 * - CARETAKER (on-site staff) records expenses, maintenance and vendors, but
 *   may only change expenses they entered themselves and never in bulk.
 */

export type PermissionAction =
  /** Deleting financial records: income, expenses, petty cash, invoices, owner invoices */
  | "FINANCIAL_DELETE"
  /** Tenancy lifecycle: vacate, checkout finalize, deposit settlement, tenant delete */
  | "TENANT_LIFECYCLE"
  /** Org-level settings/branding writes */
  | "ORG_SETTINGS"
  /** Edit / delete / attach receipts to an expense someone ELSE recorded */
  | "EXPENSE_EDIT_OTHERS"
  /** Bulk expense actions (multi-row delete / retype / mark paid, delete-all) */
  | "EXPENSE_BULK";

/** Actions denied per orgRole. Roles not listed are denied nothing extra. */
const DENIED: Record<string, ReadonlySet<PermissionAction>> = {
  ACCOUNTANT: new Set<PermissionAction>([
    "FINANCIAL_DELETE",
    "TENANT_LIFECYCLE",
    "ORG_SETTINGS",
  ]),
  // Not FINANCIAL_DELETE: a caretaker may delete an expense they recorded
  // (own-row check in src/lib/expense-access.ts). Every other FINANCIAL_DELETE
  // route sits behind requireManagerWrite, which already excludes CARETAKER.
  CARETAKER: new Set<PermissionAction>([
    "EXPENSE_EDIT_OTHERS",
    "EXPENSE_BULK",
    "TENANT_LIFECYCLE",
    "ORG_SETTINGS",
  ]),
};

export function roleCan(orgRole: string | undefined | null, action: PermissionAction): boolean {
  if (!orgRole) return true; // super-admin (no org role) is never restricted here
  return !DENIED[orgRole]?.has(action);
}

/**
 * Numeric ordering of org roles for escalation guards (higher = more
 * privileged). Shared by user creation, user edits, and invitations so no
 * flow lets a caller mint or promote a role above their own.
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  ADMIN: 3,
  MANAGER: 2,
  ACCOUNTANT: 1,
  CARETAKER: 1,
  OWNER: 0,
};

/** True when `targetRole` outranks the caller's org role. */
export function roleOutranksCaller(targetRole: string, callerOrgRole: string | undefined | null): boolean {
  return (ROLE_HIERARCHY[targetRole] ?? 0) > (ROLE_HIERARCHY[callerOrgRole ?? ""] ?? 0);
}

/** Human-readable denial message per action (for 403 bodies + UI toasts). */
export const PERMISSION_DENIED_MESSAGE: Record<PermissionAction, string> = {
  FINANCIAL_DELETE:    "Your role cannot delete financial records. Ask an admin or manager.",
  TENANT_LIFECYCLE:    "Your role cannot change tenancy status. Ask an admin or manager.",
  ORG_SETTINGS:        "Your role cannot change organisation settings. Ask an admin or manager.",
  EXPENSE_EDIT_OTHERS: "You can only change expenses you recorded yourself.",
  EXPENSE_BULK:        "Your role cannot run bulk expense actions. Ask an admin or manager.",
};
