import { requireOpsStaff } from "@/lib/auth-utils";
import { listStays } from "@/lib/stays";

// Short-stay bookings for on-site staff — ops staff incl. CARETAKER. Dates,
// units, guests and the on-site record only: never rates, totals or agents.
// GET ?from=yyyy-mm-dd&to=yyyy-mm-dd&propertyId= (window ≤ 62 days)

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const { error } = await requireOpsStaff();
  if (error) return error;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) {
    return Response.json({ error: "from and to must be dates (yyyy-mm-dd), from ≤ to" }, { status: 400 });
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) {
    return Response.json({ error: "Ask for 62 days or fewer" }, { status: 400 });
  }
  return Response.json(await listStays({ from, to, propertyId: url.searchParams.get("propertyId") }));
}
