import { requireAuth, requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

function computeStatus(expiryDate: Date | null): "VALID" | "EXPIRING_SOON" | "EXPIRED" | "ONGOING" {
  if (!expiryDate) return "ONGOING";
  const now = new Date();
  const days = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING_SOON";
  return "VALID";
}

async function getCert(id: string) {
  return prisma.complianceCertificate.findUnique({
    where: { id },
    include: { property: { select: { id: true, name: true } } },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const cert = await getCert(params.id);
  if (!cert) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(cert.propertyId);
  if (!access.ok) return access.error!;

  return Response.json({ ...cert, status: computeStatus(cert.expiryDate) });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const cert = await getCert(params.id);
  if (!cert) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(cert.propertyId);
  if (!access.ok) return access.error!;

  const body = await req.json();
  const { certificateType, issueDate, expiryDate, certificateNumber, issuedBy, notes } = body;

  const updated = await prisma.complianceCertificate.update({
    where: { id: params.id },
    data: {
      ...(certificateType != null ? { certificateType: String(certificateType).trim() } : {}),
      ...(issueDate != null ? { issueDate: new Date(issueDate) } : {}),
      ...(expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
      ...(certificateNumber !== undefined ? { certificateNumber: certificateNumber?.trim() ?? null } : {}),
      ...(issuedBy !== undefined ? { issuedBy: issuedBy?.trim() ?? null } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() ?? null } : {}),
    },
    include: { property: { select: { id: true, name: true } } },
  });

  return Response.json({ ...updated, status: computeStatus(updated.expiryDate) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await requireManager();
  if (error) return error;

  const cert = await getCert(params.id);
  if (!cert) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(cert.propertyId);
  if (!access.ok) return access.error!;

  await prisma.complianceCertificate.delete({ where: { id: params.id } });
  return Response.json({ ok: true });
}
