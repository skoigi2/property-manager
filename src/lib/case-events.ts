import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { uploadCaseAttachment, getCaseAttachmentSignedUrl } from "@/lib/supabase-storage";

/**
 * Shared "append to a case timeline" logic used by POST /api/cases/[id]/events
 * and POST /api/complaints/[id]/events. Adds the limits the case route never
 * had: file count, size and type. Never trusts the client MIME on its own —
 * falls back to the extension for camera uploads that arrive with none.
 */

export const CASE_ATTACHMENT_MAX_FILES = 8;
export const CASE_ATTACHMENT_MAX_MB = 10;
export const CASE_BODY_MAX_CHARS = 20_000;

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "application/pdf",
]);
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|heic|heif|gif)$/i;

export type AttachmentCheck = { ok: true } | { ok: false; error: string };

/** Pure validation of an upload batch (unit-tested). */
export function validateCaseAttachments(files: { name: string; size: number; type: string }[]): AttachmentCheck {
  if (files.length > CASE_ATTACHMENT_MAX_FILES) {
    return { ok: false, error: `Attach at most ${CASE_ATTACHMENT_MAX_FILES} files per comment.` };
  }
  for (const f of files) {
    if (f.size > CASE_ATTACHMENT_MAX_MB * 1024 * 1024) {
      return { ok: false, error: `"${f.name}" is too large (${(f.size / (1024 * 1024)).toFixed(1)} MB) — the maximum is ${CASE_ATTACHMENT_MAX_MB} MB per file.` };
    }
    const typeOk = f.type ? ALLOWED_TYPES.has(f.type) : ALLOWED_EXT.test(f.name);
    if (!typeOk) {
      return { ok: false, error: `"${f.name}" is not a supported file type. Upload an image (JPG, PNG, HEIC, WebP) or a PDF.` };
    }
  }
  return { ok: true };
}

export interface ParsedCaseEventRequest {
  body: string | null;
  files: File[];
  /** Extra JSON/form fields the caller may interpret (e.g. visibleToTenant). */
  fields: Record<string, string>;
}

/** Accepts multipart/form-data (body + file[]) or JSON ({ body, ... }). */
export async function parseCaseEventRequest(req: Request): Promise<ParsedCaseEventRequest | Response> {
  const contentType = req.headers.get("content-type") ?? "";
  let body: string | null = null;
  let files: File[] = [];
  const fields: Record<string, string> = {};

  if (contentType.startsWith("multipart/form-data")) {
    const form = await req.formData();
    body = (form.get("body") as string | null) ?? null;
    files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    form.forEach((v, k) => {
      if (k !== "body" && k !== "file" && typeof v === "string") fields[k] = v;
    });
  } else {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    body = typeof json.body === "string" ? json.body : null;
    for (const [k, v] of Object.entries(json)) {
      if (k !== "body" && (typeof v === "string" || typeof v === "boolean" || typeof v === "number")) fields[k] = String(v);
    }
  }

  body = body?.trim() || null;
  if (!body && files.length === 0) {
    return Response.json({ error: "Comment body or attachment required" }, { status: 400 });
  }
  if (body && body.length > CASE_BODY_MAX_CHARS) {
    return Response.json({ error: `Comment is too long (max ${CASE_BODY_MAX_CHARS} characters).` }, { status: 400 });
  }
  const check = validateCaseAttachments(files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

  return { body, files, fields };
}

/** Thrown by appendCaseEvent when an upload fails; routes map it to 503. */
export class CaseAttachmentError extends Error {
  constructor(message: string) { super(message); this.name = "CaseAttachmentError"; }
}

/** Standard 503 body for a CaseAttachmentError; null for anything else. */
export function attachmentErrorResponse(e: unknown): Response | null {
  if (!(e instanceof CaseAttachmentError)) return null;
  return Response.json({ error: "Photos could not be saved — file storage is unavailable. Try again, or add the note without attachments.", code: "STORAGE_UNAVAILABLE" }, { status: 503 });
}

export interface CaseEventActor {
  userId: string | null;
  email: string | null;
  name: string | null;
}

/**
 * Uploads attachments, writes the CaseEvent and bumps lastActivityAt in one
 * array-form transaction, then audits. Returns the created event.
 */
export async function appendCaseEvent(input: {
  threadId: string;
  organizationId: string | null;
  actor: CaseEventActor;
  body: string | null;
  files?: File[];
  meta?: Prisma.InputJsonValue;
  kind?: "COMMENT" | "DOCUMENT_ADDED" | "EXTERNAL_UPDATE";
}) {
  const attachmentPaths: string[] = [];
  for (const file of input.files ?? []) {
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      const path = await uploadCaseAttachment(input.threadId, file.name, buf, file.type || "application/octet-stream");
      attachmentPaths.push(path);
    } catch (e) {
      // Storage misconfigured / unreachable — surface as a clean error rather
      // than a 500, and never write a half-attached event.
      throw new CaseAttachmentError(e instanceof Error ? e.message : "File storage is not available");
    }
  }
  const kind = input.kind ?? (attachmentPaths.length > 0 && !input.body ? "DOCUMENT_ADDED" : "COMMENT");

  const [event] = await prisma.$transaction([
    prisma.caseEvent.create({
      data: {
        caseThreadId: input.threadId,
        kind,
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        actorName: input.actor.name,
        body: input.body,
        attachmentUrls: attachmentPaths,
        ...(input.meta !== undefined ? { meta: input.meta } : {}),
      },
    }),
    prisma.caseThread.update({ where: { id: input.threadId }, data: { lastActivityAt: new Date() } }),
  ]);

  if (input.actor.userId) {
    await logAudit({
      userId: input.actor.userId,
      userEmail: input.actor.email,
      action: "CREATE",
      resource: "CaseEvent",
      resourceId: event.id,
      organizationId: input.organizationId,
      after: { kind: event.kind, attachments: attachmentPaths.length, body: event.body?.slice(0, 200) ?? null },
    });
  }
  return event;
}

/** Timeline events (ASC) with best-effort signed attachment URLs. No tenant context. */
export async function loadCaseTimeline(threadId: string) {
  const events = await prisma.caseEvent.findMany({ where: { caseThreadId: threadId }, orderBy: { createdAt: "asc" } });
  return Promise.all(
    events.map(async (e) => {
      if (!e.attachmentUrls || e.attachmentUrls.length === 0) return { ...e, attachmentLinks: [] as { path: string; url: string | null }[] };
      const links = await Promise.all(
        e.attachmentUrls.map(async (p) => {
          try { return { path: p, url: await getCaseAttachmentSignedUrl(p) }; }
          catch { return { path: p, url: null }; }
        }),
      );
      return { ...e, attachmentLinks: links };
    }),
  );
}
