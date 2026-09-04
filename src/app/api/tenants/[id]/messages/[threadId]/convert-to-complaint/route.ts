import { z } from "zod";
import { requireManagerWrite, getAccessiblePropertyIds } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { COMPLAINT_CATEGORIES } from "@/lib/validations";
import { createComplaint, complaintToDto } from "@/lib/complaints";
import { notifyNewComplaint } from "@/lib/complaint-notify";

const schema = z.object({
  category:    z.enum(COMPLAINT_CATEGORIES).default("OTHER"),
  title:       z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
});

/**
 * POST /api/tenants/[id]/messages/[threadId]/convert-to-complaint
 *
 * Manager-only. Turns a portal chat thread into a formal complaint: the
 * tenant becomes the complainant (source PORTAL, so it appears under "My
 * complaints" in their portal with the SLA clock running), the thread is
 * linked one-way via PortalMessageThread.complaintId (409 on a second
 * attempt), and a MANAGER reply tells the tenant where to follow it. The
 * thread itself is left open — resolve it separately if the chat is done.
 */
export async function POST(req: Request, { params }: { params: { id: string; threadId: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.portalMessageThread.findUnique({
    where: { id: params.threadId },
    include: {
      tenant: { select: { id: true, name: true, email: true, unitId: true, unit: { select: { propertyId: true, property: { select: { organizationId: true } } } } } },
      messages: { orderBy: { createdAt: "asc" }, select: { body: true, sender: true } },
    },
  });
  if (!thread || thread.tenantId !== params.id) return Response.json({ error: "Not found" }, { status: 404 });
  if (!propertyIds.includes(thread.tenant.unit.propertyId)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (thread.complaintId) {
    return Response.json({ error: "This conversation has already been logged as a complaint.", code: "ALREADY_CONVERTED", complaintId: thread.complaintId }, { status: 409 });
  }
  const orgId = thread.tenant.unit.property.organizationId;
  if (!orgId) return Response.json({ error: "Property has no organisation" }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // Default description: the tenant's own messages, in order — their words,
  // not the manager's paraphrase — so the portal shows exactly what they said.
  const tenantWords = thread.messages.filter((m) => m.sender === "TENANT").map((m) => m.body.trim()).filter(Boolean).join("\n\n");
  const description = parsed.data.description?.trim() || tenantWords || null;

  const complaint = await createComplaint({
    propertyId: thread.tenant.unit.propertyId,
    organizationId: orgId,
    unitId: thread.tenant.unitId,
    tenantId: thread.tenant.id,
    subjectUnitId: null,
    category: parsed.data.category,
    title: parsed.data.title?.trim() || thread.subject.trim().slice(0, 200),
    description,
    source: "PORTAL",
    raisedByUserId: null,
    raisedByName: thread.tenant.name,
    actor: { userId: null, email: thread.tenant.email ?? null, name: thread.tenant.name },
  });

  const now = new Date();
  await prisma.$transaction([
    prisma.portalMessageThread.update({
      where: { id: thread.id },
      data: { complaintId: complaint.id, lastMessageAt: now, status: thread.status === "SENT" ? "READ" : thread.status },
    }),
    prisma.portalMessage.create({
      data: {
        threadId: thread.id,
        sender: "MANAGER",
        authorUserId: session!.user.id,
        body: `We've logged this as a formal complaint so it is tracked with a response time. You can follow its progress in your portal under Request → Complaint.`,
      },
    }),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "UPDATE",
    resource: "PortalMessageThread",
    resourceId: thread.id,
    organizationId: orgId,
    after: { convertedToComplaint: complaint.id, category: parsed.data.category },
  });

  void notifyNewComplaint(complaint.id);

  return Response.json({ ...complaintToDto(complaint), threadId: thread.id }, { status: 201 });
}
