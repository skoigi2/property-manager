"use client";

import { useSession } from "next-auth/react";
import { roleCan, type PermissionAction } from "@/lib/permissions";

/**
 * Client-side mirror of the server permission gate (requirePermissionWrite).
 * Purely cosmetic — hides controls the API would 403 anyway. Defaults to
 * allowed while the session is loading so managers never see a flash of
 * missing buttons.
 */
export function usePermissions(): { can: (action: PermissionAction) => boolean } {
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  return { can: (action) => roleCan(orgRole, action) };
}
