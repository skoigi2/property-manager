import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { loadRentIncreaseNotice } from "@/lib/rent-increase";
import { generateRentIncreaseNoticePdf } from "@/lib/rent-increase-notice-pdf";

export const maxDuration = 30;

// The rent increase notice letter (PDF) for one increase.
export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string; historyId: string }> }
) {
  const params = await props.params;
  const { error } = await requireManager();
  if (error) return error;
  const data = await loadRentIncreaseNotice(params.id, params.historyId);
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await requirePropertyAccess(data.tenant.unit.propertyId);
  if (!access.ok) return access.error!;

  const pdf = await generateRentIncreaseNoticePdf(data.pdfInput);
  const file = `Rent increase notice - ${data.tenant.name} - Unit ${data.tenant.unit.unitNumber}.pdf`.replace(/[^\w .-]/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
