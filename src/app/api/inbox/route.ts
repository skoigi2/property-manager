import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildInbox } from "@/lib/inbox";

export async function GET(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (!ids || ids.length === 0) {
    return Response.json({ items: [], counts: { urgent: 0, today: 0, thisWeek: 0 } });
  }

  // Optional ?propertyId= filter — intersected with accessible IDs so it can
  // only narrow, never widen, the user's scope.
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  const scope = propertyId && ids.includes(propertyId) ? [propertyId] : ids;

  const data = await buildInbox(scope);
  return Response.json(data);
}
