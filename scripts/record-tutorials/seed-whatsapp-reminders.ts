/**
 * Recording preconditions for `whatsapp-reminders`.
 *
 * Same Kenyan org as `utilities-metering` (guide-utilities@groundworkpm.com,
 * "Nairobi Homes Management", KES): seedUtilities re-creates its Kilimani Court
 * demo, whose Inbox has two overdue rent invoices — Faith Chebet (103) and
 * Samuel Kiprono (201). Then:
 * - Faith gets a valid portal link (her reminder carries it);
 * - Samuel has none (the bulk step offers "Create portal link & send");
 * - Brian Otieno (G01) loses his phone number (the greyed-out button beat).
 */
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { seedUtilities, UTILITIES_RECORD_EMAIL } from "./seed-utilities";

export const PORTAL_TENANT = "Faith Chebet";
export const NO_PORTAL_TENANT = "Samuel Kiprono";
export const NO_PHONE_TENANT = "Brian Otieno";

export async function seedWhatsAppReminders(prisma: PrismaClient, fixturesDir: string): Promise<void> {
  await seedUtilities(prisma, fixturesDir);

  const user = await prisma.user.findUnique({ where: { email: UTILITIES_RECORD_EMAIL }, select: { organizationId: true } });
  const property = await prisma.property.findFirst({
    where: { organizationId: user!.organizationId!, name: "Kilimani Court" },
    select: { id: true },
  });
  if (!property) throw new Error("Kilimani Court not found after seeding");
  const tenantNamed = async (name: string) => {
    const t = await prisma.tenant.findFirst({ where: { name, isActive: true, unit: { propertyId: property.id } }, select: { id: true } });
    if (!t) throw new Error(`No active tenant "${name}" in Kilimani Court`);
    return t.id;
  };

  await prisma.tenant.update({
    where: { id: await tenantNamed(PORTAL_TENANT) },
    data: { portalToken: randomUUID().replace(/-/g, ""), portalTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000) },
  });
  await prisma.tenant.update({
    where: { id: await tenantNamed(NO_PORTAL_TENANT) },
    data: { portalToken: null, portalTokenExpiresAt: null },
  });
  await prisma.tenant.update({ where: { id: await tenantNamed(NO_PHONE_TENANT) }, data: { phone: null } });
  console.log(`  ✓ ${PORTAL_TENANT} has a portal link, ${NO_PORTAL_TENANT} has none, ${NO_PHONE_TENANT} has no phone`);
}
