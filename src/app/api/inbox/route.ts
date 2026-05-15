import { requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildInbox } from "@/lib/inbox";

export async function GET() {
  const { error } = await requireManager();
  if (error) return error;

  const ids = await getAccessiblePropertyIds();
  if (!ids || ids.length === 0) {
    return Response.json({ items: [], counts: { urgent: 0, today: 0, thisWeek: 0 } });
  }

  const data = await buildInbox(ids);
  return Response.json(data);
}
