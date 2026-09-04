import { getAccessiblePropertyIds, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { removeInsuranceDocumentFile } from "@/lib/insurance-document-urls";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; docId: string } }
) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.insurancePolicyDocument.findUnique({
    where: { id: params.docId },
    include: { policy: { select: { propertyId: true, policyNumber: true } } },
  });

  if (!doc || doc.policyId !== params.id) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(doc.policy.propertyId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await removeInsuranceDocumentFile(doc.fileUrl);

  try {
    await prisma.insurancePolicyDocument.delete({ where: { id: params.docId } });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "DELETE",
    resource: "InsurancePolicyDocument",
    resourceId: params.docId,
    organizationId: session!.user.organizationId,
    before: { policyId: doc.policyId, policyNumber: doc.policy.policyNumber, category: doc.category, label: doc.label, fileName: doc.fileName },
  });

  return Response.json({ success: true });
}
