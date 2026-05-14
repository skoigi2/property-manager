import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { computeSetupProgress } from "@/lib/setup-progress";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const accessibleIds = await getAccessiblePropertyIds();
  if (!accessibleIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  if (propertyId) {
    if (!accessibleIds.includes(propertyId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const progress = await computeSetupProgress(propertyId);
    if (!progress) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(progress);
  }

  const all = await Promise.all(accessibleIds.map((id) => computeSetupProgress(id)));
  return Response.json(all.filter((p): p is NonNullable<typeof p> => p !== null));
}
