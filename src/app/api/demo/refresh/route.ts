import { NextResponse } from "next/server";
import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { demoAddedSinceSeed, refreshDemoProperty } from "@/lib/demo-seed";
import { describeAddedSinceSeed, isSampleStale } from "@/lib/demo-refresh";

// A refresh deletes the sample and runs its full seed (hundreds of inserts).
export const maxDuration = 300;

/**
 * Refresh a sample property: GET previews it (what the user added since it
 * was loaded — all of it goes), POST deletes it and seeds it again under the
 * same id with today's dates. Admins and managers only, like loading one
 * (POST /api/demo/seed); exempt from the subscription write-lock like it too.
 */
async function authorize(propertyId: string | null) {
  const { error, session } = await requireManager();
  if (error) return { error };
  const isSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  if (!isSuperAdmin && session!.user.orgRole !== "ADMIN" && session!.user.orgRole !== "MANAGER") {
    return { error: NextResponse.json({ error: "Only admins and managers can refresh sample properties." }, { status: 403 }) };
  }
  if (!propertyId) return { error: NextResponse.json({ error: "propertyId is required." }, { status: 400 }) };
  const access = await requirePropertyAccess(propertyId);
  if (!access.ok) return { error: access.error! };
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true, isDemo: true, createdAt: true, organizationId: true },
  });
  if (!property || (!isSuperAdmin && property.organizationId !== session!.user.organizationId)) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  if (!property.isDemo) {
    return { error: NextResponse.json({ error: "Only sample properties can be refreshed." }, { status: 400 }) };
  }
  return { session: session!, property };
}

export async function GET(req: Request) {
  const auth = await authorize(new URL(req.url).searchParams.get("propertyId"));
  if (auth.error) return auth.error;
  const { property } = auth;
  const added = await demoAddedSinceSeed(property.id, property.createdAt);
  return NextResponse.json({
    propertyId: property.id,
    name: property.name,
    seededAt: property.createdAt,
    stale: isSampleStale(property.createdAt),
    added,
    addedText: describeAddedSinceSeed(added),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const auth = await authorize(typeof body?.propertyId === "string" ? body.propertyId : null);
  if (auth.error) return auth.error;
  const { session, property } = auth;
  try {
    await refreshDemoProperty(property.id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[demo/refresh] failed:", detail);
    return NextResponse.json(
      { error: "Refreshing the sample failed. Load it again from Properties.", detail },
      { status: 500 },
    );
  }
  await logAudit({
    userId: session.user.id,
    userEmail: session.user.email,
    action: "UPDATE",
    resource: "Property",
    resourceId: property.id,
    organizationId: property.organizationId,
    before: { name: property.name, seededAt: property.createdAt },
    after: { name: property.name, refreshedSample: true },
  });
  return NextResponse.json({ ok: true, propertyId: property.id });
}
