import { requireOpsStaff } from "@/lib/auth-utils";
import { loadStay, serializeStay } from "@/lib/stays";

// One stay (id = the booking's IncomeEntry id) — ops staff incl. CARETAKER.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireOpsStaff();
  if (error) return error;
  const loaded = await loadStay(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  return Response.json(await serializeStay(loaded.entry, session!));
}
