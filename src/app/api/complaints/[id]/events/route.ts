import { requireOpsStaffWrite } from "@/lib/auth-utils";
import { parseCaseEventRequest, appendCaseEvent, attachmentErrorResponse } from "@/lib/case-events";
import { loadComplaintForSession } from "@/lib/complaints";

/**
 * POST /api/complaints/[id]/events — comment + photos on the complaint's case
 * timeline. Ops staff incl. CARETAKER. `visibleToTenant` (form field or JSON
 * boolean) marks a comment the portal may show; staff notes default to hidden.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireOpsStaffWrite();
  if (error) return error;

  const loaded = await loadComplaintForSession(params.id, session!);
  if (loaded.error) return loaded.error;
  const c = loaded.complaint;
  if (!c.caseThreadId) return Response.json({ error: "This complaint has no case behind it." }, { status: 409 });

  const parsed = await parseCaseEventRequest(req);
  if (parsed instanceof Response) return parsed;

  const visibleToTenant = parsed.fields.visibleToTenant === "true";
  let event;
  try {
    event = await appendCaseEvent({
      threadId: c.caseThreadId,
      organizationId: c.organizationId,
      actor: { userId: session!.user.id, email: session!.user.email ?? null, name: session!.user.name ?? null },
      body: parsed.body,
      files: parsed.files,
      meta: { visibleToTenant },
    });
  } catch (e) {
    const r = attachmentErrorResponse(e);
    if (r) return r;
    throw e;
  }

  return Response.json(event, { status: 201 });
}
