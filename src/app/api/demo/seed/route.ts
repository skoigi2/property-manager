import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DEMO_PROPERTIES } from "@/lib/demo-definitions";
import { seedDemoProperty, grantOrgAccess } from "@/lib/demo-seed";
import { deletePropertyOps } from "@/lib/property-delete";
import { seedDemoUtilities, demoUtilitiesState, clearDemoUtilities } from "@/lib/demo-utilities";

// Seeding does hundreds of inserts; on Vercel (higher per-query latency than
// local) this can exceed 60 s. Raise to the platform max (the seeds run
// independent inserts in parallel chunks to keep wall-clock well under it).
export const maxDuration = 300;

export async function POST(req: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  // Read body first so we can use the client-supplied organizationId
  const body = await req.json().catch(() => ({}));
  const demoKey     = body?.demoKey        as string | undefined;
  const clientOrgId = body?.organizationId as string | undefined;
  const force       = body?.force === true; // if true, delete existing property and re-seed

  // ── Resolve organizationId ────────────────────────────────────────────────
  // Prefer the org the client explicitly sent (= session.user.organizationId on
  // the browser, always the active org). Fall back to server-side lookups only
  // when the client sends nothing (e.g. onboarding with a brand-new org that
  // hasn't been written to the JWT cookie yet).
  let organizationId: string | null = null;

  if (clientOrgId) {
    // Validate the user actually belongs to this org before trusting it
    const membership = await prisma.userOrganizationMembership.findFirst({
      where: { userId: session!.user.id, organizationId: clientOrgId },
      select: { organizationId: true },
    });
    if (!membership) {
      // Membership row may be missing (pgBouncer partial commit) — also accept
      // if User.organizationId matches
      const dbUser = await prisma.user.findUnique({
        where: { id: session!.user.id },
        select: { organizationId: true },
      });
      if (dbUser?.organizationId !== clientOrgId) {
        return NextResponse.json({ error: "Organisation access denied." }, { status: 403 });
      }
    }
    organizationId = clientOrgId;
  } else {
    // No org in body — fall back to server-side resolution
    organizationId = (session!.user as any).organizationId as string | null;
    if (!organizationId) {
      const membership = await prisma.userOrganizationMembership.findFirst({
        where: { userId: session!.user.id },
        select: { organizationId: true },
      });
      organizationId = membership?.organizationId ?? null;
    }
    if (!organizationId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session!.user.id },
        select: { organizationId: true },
      });
      organizationId = dbUser?.organizationId ?? null;
    }
  }

  if (!organizationId) {
    return NextResponse.json({ error: "No organisation found. Complete onboarding first." }, { status: 400 });
  }

  // Only admins and managers may seed sample properties. Judged by the
  // MEMBERSHIP role for the target org (DB lookup — the JWT may be stale
  // during onboarding). A missing membership row was already validated above
  // via User.organizationId (brand-new founder whose membership write raced)
  // — founders are admins, so that path stays open.
  const callerIsSuperAdmin = session!.user.role === "ADMIN" && session!.user.organizationId === null;
  if (!callerIsSuperAdmin) {
    const callerMembership = await prisma.userOrganizationMembership.findUnique({
      where: { userId_organizationId: { userId: session!.user.id, organizationId } },
      select: { role: true },
    });
    const memberRole = callerMembership?.role ?? "ADMIN"; // racing-founder fallback
    if (memberRole !== "ADMIN" && memberRole !== "MANAGER") {
      return NextResponse.json(
        { error: "Only admins and managers can load sample properties." },
        { status: 403 },
      );
    }
  }

  const demo = DEMO_PROPERTIES.find((d) => d.key === demoKey);
  if (!demo) {
    return NextResponse.json({ error: "Unknown demo key." }, { status: 400 });
  }

  // Idempotency — check if this demo property already exists for this org
  const existing = await prisma.property.findFirst({
    where: { name: demo.name, organizationId },
    include: { _count: { select: { units: true } } },
  });

  const grantAccess = (propertyId: string) => grantOrgAccess(propertyId, organizationId!);

  if (existing) {
    if (existing._count.units > 0 && !force) {
      // Fully seeded — backfill access for any org members who are missing it
      await grantAccess(existing.id);
      // A Kilimani Court seeded before utility metering existed (or with the
      // first, readings-only version) is topped up in place — never when
      // someone has entered readings of their own.
      let utilitiesAdded = false;
      if (demo.key === "kilimani-court") {
        const state = await demoUtilitiesState(existing.id);
        if (state === "none" || state === "demo") {
          if (state === "demo") await clearDemoUtilities(existing.id);
          await seedDemoUtilities(existing.id, organizationId);
          utilitiesAdded = true;
        }
      }
      return NextResponse.json({ ok: false, reason: "already_seeded", propertyId: existing.id, organizationId, utilitiesAdded });
    }
    // Either partially seeded (no units) or force re-seed requested — delete and re-seed.
    await prisma.$transaction(deletePropertyOps(existing.id));
  }

  try {
    const property = await seedDemoProperty(demo.key, organizationId);
    if (!property) return NextResponse.json({ error: "Demo not yet implemented." }, { status: 400 });
    await grantAccess(property.id);
    return NextResponse.json({ ok: true, propertyId: property.id, organizationId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[demo/seed] Error seeding demo property:", message);

    // Best-effort cleanup: if the seed function partially created the property
    // (e.g. Vercel function timeout, pgBouncer connection drop), delete the
    // partial record so the next attempt starts clean instead of returning
    // "already_seeded" with incomplete data.
    try {
      const partial = await prisma.property.findFirst({
        where: { name: demo.name, organizationId },
        select: { id: true },
      });
      if (partial) {
        await prisma.$transaction(deletePropertyOps(partial.id));
        console.warn("[demo/seed] Deleted partial property after failure:", partial.id);
      }
    } catch (cleanupErr) {
      console.error("[demo/seed] Cleanup of partial property failed:", cleanupErr);
    }

    return NextResponse.json({ ok: false, error: "Seed failed. Please try again.", detail: message }, { status: 500 });
  }
}
