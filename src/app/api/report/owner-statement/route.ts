import { requireAuth, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { buildOwnerStatements } from "@/lib/owner-statement";

export type { OwnerStatement, OwnerStatementLine } from "@/lib/owner-statement";

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year       = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const month      = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const propertyId = searchParams.get("propertyId");

  const targetPropertyIds = propertyId && propertyIds.includes(propertyId)
    ? [propertyId]
    : propertyIds;

  const statements = await buildOwnerStatements(targetPropertyIds, year, month);
  return Response.json(statements);
}
