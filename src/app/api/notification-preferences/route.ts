import { requireAuth, requireAuthWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Email categories a user can opt out of. Mirrors AutomationCategory minus
// REMINDER (Inbox-only, never emailed).
const CATEGORIES = ["NOTIFICATION", "WORKFLOW"] as const;

// GET /api/notification-preferences — the current user's effective email
// preferences (defaults to opted-in where no row exists).
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const rows = await prisma.notificationPreference.findMany({
    where: { userId: session!.user.id },
    select: { category: true, emailEnabled: true },
  });
  const byCat = new Map(rows.map((r) => [r.category, r.emailEnabled]));

  const preferences = CATEGORIES.map((category) => ({
    category,
    emailEnabled: byCat.has(category) ? byCat.get(category)! : true,
  }));

  return Response.json({ preferences });
}

const putSchema = z.object({
  category: z.enum(CATEGORIES),
  emailEnabled: z.boolean(),
});

// PUT /api/notification-preferences — upsert one category for the current user.
export async function PUT(req: Request) {
  const { session, error } = await requireAuthWrite();
  if (error) return error;

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { category, emailEnabled } = parsed.data;
  const userId = session!.user.id;

  await prisma.notificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, emailEnabled },
    update: { emailEnabled },
  });

  return Response.json({ category, emailEnabled });
}
