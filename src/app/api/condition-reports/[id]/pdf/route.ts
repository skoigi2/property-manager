import "server-only";
import { requireOpsStaff } from "@/lib/auth-utils";
import { loadInspection } from "@/lib/inspections";
import { buildConditionReportPdf } from "@/lib/condition-report-pdf-data";

export const maxDuration = 60;

// Download the report as it stands (ops staff incl. the caretaker who ran it).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireOpsStaff();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });

  const pdf = await buildConditionReportPdf(loaded.report.id);
  if (!pdf) return Response.json({ error: "Inspection not found" }, { status: 404 });
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
    },
  });
}
