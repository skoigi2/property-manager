/**
 * Role-based permission map — granular distinctions between manager-tier
 * roles. `requireManager()` admits ADMIN/MANAGER/ACCOUNTANT alike; this layer
 * is the finer cut for actions an ACCOUNTANT must not perform.
 *
 * Principle: ACCOUNTANT records and reconciles money but cannot destroy
 * financial history or drive tenancy lifecycle / org configuration.
 */

export type PermissionAction =
  /** Deleting financial records: income, expenses, petty cash, invoices, owner invoices */
  | "FINANCIAL_DELETE"
  /** Tenancy lifecycle: vacate, checkout finalize, deposit settlement, tenant delete */
  | "TENANT_LIFECYCLE"
  /** Org-level settings/branding writes */
  | "ORG_SETTINGS";

/** Actions denied per orgRole. Roles not listed are denied nothing extra. */
const DENIED: Record<string, ReadonlySet<PermissionAction>> = {
  ACCOUNTANT: new Set<PermissionAction>([
    "FINANCIAL_DELETE",
    "TENANT_LIFECYCLE",
    "ORG_SETTINGS",
  ]),
};

export function roleCan(orgRole: string | undefined | null, action: PermissionAction): boolean {
  if (!orgRole) return true; // super-admin (no org role) is never restricted here
  return !DENIED[orgRole]?.has(action);
}

/** Human-readable denial message per action (for 403 bodies + UI toasts). */
export const PERMISSION_DENIED_MESSAGE: Record<PermissionAction, string> = {
  FINANCIAL_DELETE: "Accountants cannot delete financial records. Ask an admin or manager.",
  TENANT_LIFECYCLE: "Accountants cannot change tenancy status. Ask an admin or manager.",
  ORG_SETTINGS: "Accountants cannot change organisation settings. Ask an admin or manager.",
};
