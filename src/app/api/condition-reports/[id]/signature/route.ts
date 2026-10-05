import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { uploadToStorage, deleteFromStorage, getSignedUrl } from "@/lib/supabase-storage";
import { loadInspection } from "@/lib/inspections";
import { canEditObservations } from "@/lib/inspection-rules";

const MAX_BYTES = 1024 * 1024;

// The tenant signs on the inspector's phone: multipart { file: PNG, name }.
// Replaces any earlier signature and records the sign-off as SIGNED.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireOpsStaffWrite();
  if (error) return error;
  const loaded = await loadInspection(params.id);
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status });
  const report = loaded.report;
  if (!canEditObservations(report.status)) {
    return Response.json({ error: "This inspection has been handed in — the signature is locked." }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!file) return Response.json({ error: "No signature provided" }, { status: 400 });
  if (file.type !== "image/png") return Response.json({ error: "The signature must be a PNG image" }, { status: 400 });
  if (file.size > MAX_BYTES || file.size < 200) return Response.json({ error: "The signature image is not valid" }, { status: 400 });
  if (!name) return Response.json({ error: "Type the name of the person who signed" }, { status: 400 });

  const storagePath = `condition-reports/${report.id}/signature-${Date.now()}.png`;
  try {
    await uploadToStorage(storagePath, Buffer.from(await file.arrayBuffer()), "image/png");
  } catch {
    return Response.json({ error: "Signature storage is unavailable — try again shortly.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }
  const signedAt = new Date();
  await prisma.conditionReport.update({
    where: { id: report.id },
    data: {
      tenantSignaturePath: storagePath,
      tenantSignOff: "SIGNED",
      tenantSignedName: name,
      tenantSignedAt: signedAt,
      ...(report.status === "SCHEDULED" ? { status: "IN_PROGRESS" as const } : {}),
    },
  });
  if (report.tenantSignaturePath) {
    try { await deleteFromStorage(report.tenantSignaturePath); } catch { /* best-effort */ }
  }

  let url: string | null = null;
  try { url = await getSignedUrl(storagePath); } catch { /* keep null */ }
  return Response.json({ url, tenantSignedName: name, tenantSignedAt: signedAt }, { status: 201 });
}
