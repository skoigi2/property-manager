import { requireManager } from "@/lib/auth-utils";
import { loadStatementForManager } from "@/lib/tenant-statement-request";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireManager();
  if (error) return error;

  const url = new URL(req.url);
  const result = await loadStatementForManager(params.id, url.searchParams);
  if ("error" in result) return result.error;
  if ("noPeriod" in result) return result.noPeriod;

  return Response.json(result.statement);
}
