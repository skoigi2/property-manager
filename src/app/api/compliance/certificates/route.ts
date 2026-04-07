import { requireAuth, requireManager, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function computeStatus(expiryDate: Date | null): "VALID" | "EXPIRING_SOON" | "EXPIRED" | "ONGOING" {
  if (!expiryDate) return "ONGOING";
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
  if (daysUntilExpiry < 0) return "EXPIRED";
  if (daysUntilExpiry <= 30) return "EXPIRING_SOON";
  return "VALID";
}

const STATUS_ORDER = { EXPIRED: 0, EXPIRING_SOON: 1, VALID: 2, ONGOING: 3 };

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  const effectivePropertyIds =
    propertyId && propertyIds.includes(propertyId) ? [propertyId] : propertyIds;

  const certs = await prisma.complianceCertificate.findMany({
    where: { propertyId: { in: effectivePropertyIds } },
    include: { property: { select: { id: true, name: true } } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
  });

  const withStatus = certs.map((c) => ({
    ...c,
    status: computeStatus(c.expiryDate),
  }));

  withStatus.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  );

  return Response.json(withStatus);
}

export async function POST(req: Request) {
  const { error } = await requireManager();
  if (error) return error;

  const session = await auth();
  const orgId = session?.user ? (session.user as any).organizationId ?? null : null;

  const body = await req.json();
  const { propertyId, certificateType, issueDate, expiryDate, certificateNumber, issuedBy, notes } = body;

  if (!propertyId || !certificateType || !issueDate) {
    return Response.json(
      { error: "propertyId, certificateType, and issueDate are required" },
      { status: 400 }
    );
  }

  const cert = await prisma.complianceCertificate.create({
    data: {
      propertyId,
      organizationId: orgId,
      certificateType: certificateType.trim(),
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      certificateNumber: certificateNumber?.trim() ?? null,
      issuedBy: issuedBy?.trim() ?? null,
      notes: notes?.trim() ?? null,
    },
    include: { property: { select: { id: true, name: true } } },
  });

  return Response.json({ ...cert, status: computeStatus(cert.expiryDate) }, { status: 201 });
}
