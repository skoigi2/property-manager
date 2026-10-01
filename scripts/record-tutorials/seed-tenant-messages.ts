/**
 * Recording preconditions for `tenant-messages`.
 *
 * Same Kenyan org as `utilities-metering` (guide-utilities@groundworkpm.com,
 * "Nairobi Homes Management", KES): seedUtilities re-creates its Kilimani Court
 * demo. Then two portal conversations are written straight to the database
 * (as POST /api/portal/[token]/messages would, minus the notification email):
 * - Faith Chebet (103): a question sent two hours ago → "New today";
 * - Grace & Daniel Kamau (102): a thank-you sent three days ago → urgent
 *   ("Waiting 3d"), the one the video marks resolved.
 */
import type { PrismaClient } from "@prisma/client";
import { seedUtilities, UTILITIES_RECORD_EMAIL } from "./seed-utilities";

export const QUESTION_TENANT = "Faith Chebet";
export const THANKS_TENANT = "Grace & Daniel Kamau";

export async function seedTenantMessages(prisma: PrismaClient, fixturesDir: string): Promise<void> {
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

  const conversations = [
    {
      tenantId: await tenantNamed(QUESTION_TENANT),
      subject: "Water pressure in the kitchen",
      category: "GENERAL" as const,
      body: "Hi, the kitchen tap has had very low pressure since Monday. Could someone take a look this week? I'm home after 4 pm.",
      at: new Date(Date.now() - 2 * 3_600_000),
    },
    {
      tenantId: await tenantNamed(THANKS_TENANT),
      subject: "Thank you!",
      category: "GENERAL" as const,
      body: "Just to say the new gate remote works perfectly. Thanks for sorting it out so quickly!",
      at: new Date(Date.now() - 3 * 86_400_000 - 3_600_000),
    },
  ];
  for (const c of conversations) {
    await prisma.portalMessageThread.create({
      data: {
        tenantId: c.tenantId,
        subject: c.subject,
        category: c.category,
        status: "SENT",
        lastMessageAt: c.at,
        createdAt: c.at,
        messages: { create: { body: c.body, sender: "TENANT", createdAt: c.at } },
      },
    });
  }
  console.log(`  ✓ portal messages from ${QUESTION_TENANT} (today) and ${THANKS_TENANT} (3 days ago)`);
}
