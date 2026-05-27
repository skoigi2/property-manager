import { requireManager, requirePropertyAccess } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { uploadCaseAttachment } from "@/lib/supabase-storage";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManager();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const contentType = req.headers.get("content-type") ?? "";
  let body: string | null = null;
  const attachmentPaths: string[] = [];
  let kind: "COMMENT" | "DOCUMENT_ADDED" = "COMMENT";

  if (contentType.startsWith("multipart/form-data")) {
    const form = await req.formData();
    body = (form.get("body") as string | null) ?? null;
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const path = await uploadCaseAttachment(thread.id, file.name, buf, file.type || "application/octet-stream");
      attachmentPaths.push(path);
    }
    if (attachmentPaths.length > 0 && !body) kind = "DOCUMENT_ADDED";
  } else {
    const json = await req.json();
    body = json.body ?? null;
  }

  if (!body && attachmentPaths.length === 0) {
    return Response.json({ error: "Comment body or attachment required" }, { status: 400 });
  }

  const now = new Date();
  const [event] = await prisma.$transaction([
    prisma.caseEvent.create({
      data: {
        caseThreadId: thread.id,
        kind,
        actorUserId: session!.user.id,
        actorEmail: session!.user.email ?? null,
        actorName: session!.user.name ?? null,
        body,
        attachmentUrls: attachmentPaths,
      },
    }),
    prisma.caseThread.update({
      where: { id: thread.id },
      data: { lastActivityAt: now },
    }),
  ]);

  await logAudit({
    userId: session!.user.id,
    userEmail: session!.user.email,
    action: "CREATE",
    resource: "CaseEvent",
    resourceId: event.id,
    organizationId: thread.organizationId,
    after: event,
  });

  return Response.json(event, { status: 201 });
}
