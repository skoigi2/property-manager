/**
 * Tenant read projections per role.
 *
 * The on-site CARETAKER needs a tenant *directory* (who lives where, how to
 * reach them) to log a complaint — never rent, deposit, lease terms, ID
 * numbers, notes or the portal token. Mirrors src/lib/vendor-projection.ts.
 */

export const TENANT_DIRECTORY_SELECT = {
  id: true,
  name: true,
  phone: true,
  isActive: true,
  unit: { select: { id: true, unitNumber: true, propertyId: true } },
} as const;

export type TenantDirectoryRow = {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  unit: { id: string; unitNumber: string; propertyId: string };
};

/** True when the caller only gets the directory shape. */
export function tenantReadIsDirectory(orgRole: string | null | undefined, requested: boolean): boolean {
  return orgRole === "CARETAKER" || requested;
}

/** Keys the directory shape may contain — asserted in the unit test. */
export const TENANT_DIRECTORY_KEYS = ["id", "name", "phone", "isActive", "unit"] as const;
