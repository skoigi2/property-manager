import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { getSubscriptionInfo } from "@/lib/subscription";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const orgId = session!.user.organizationId;
  if (!orgId) {
    // Super-admin or new user without org
    return NextResponse.json(null);
  }

  const info = await getSubscriptionInfo(orgId);
  return NextResponse.json(info);
}
