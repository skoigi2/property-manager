import { requirePropertyAccess, requireManagerWrite } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { parseCaseEventRequest, appendCaseEvent, attachmentErrorResponse } from "@/lib/case-events";

/**
 * POST /api/cases/[id]/events — comment + multipart attachments. The parsing,
 * limits (8 files, 10 MB, images + PDF), upload and timeline write live in
 * src/lib/case-events.ts, shared with the complaints route.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireManagerWrite();
  if (error) return error;

  const thread = await prisma.caseThread.findUnique({ where: { id: params.id } });
  if (!thread) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await requirePropertyAccess(thread.propertyId);
  if (!access.ok) return access.error!;

  const parsed = await parseCaseEventRequest(req);
  if (parsed instanceof Response) return parsed;

  let event;
  try {
    event = await appendCaseEvent({
      threadId: thread.id,
      organizationId: thread.organizationId,
      actor: { userId: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null },
      body: parsed.body,
      files: parsed.files,
    });
  } catch (e) {
    const r = attachmentErrorResponse(e);
    if (r) return r;
    throw e;
  }

  return Response.json(event, { status: 201 });
}
