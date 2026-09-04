/**
 * Server-only: turn stored document rows (insurance policies, assets) into
 * what the client can open. New rows hold a private-bucket path (signed for
 * an hour here); rows from before the storage move hold a public URL in the
 * old `property-documents` bucket and pass through untouched.
 */
import { createClient } from "@supabase/supabase-js";
import { getSignedUrl, deleteFromStorage } from "@/lib/supabase-storage";
import { isLegacyPublicUrl } from "@/lib/document-files";

/** Bucket the pre-2026-09 uploads live in (public URLs). */
const LEGACY_BUCKET = "property-documents";

export async function withSignedDocumentUrls<T extends { fileUrl: string }>(docs: T[]): Promise<T[]> {
  return Promise.all(
    docs.map(async (d) => {
      if (isLegacyPublicUrl(d.fileUrl)) return d;
      try {
        return { ...d, fileUrl: await getSignedUrl(d.fileUrl, 3600) };
      } catch {
        // Storage down: keep the row visible, just not openable.
        return { ...d, fileUrl: "" };
      }
    }),
  );
}

/** Best-effort removal of the file behind a document row (never throws). */
export async function removeStoredDocumentFile(fileUrl: string): Promise<void> {
  try {
    if (!isLegacyPublicUrl(fileUrl)) {
      await deleteFromStorage(fileUrl);
      return;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const marker = `/object/public/${LEGACY_BUCKET}/`;
    const idx = new URL(fileUrl).pathname.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(new URL(fileUrl).pathname.slice(idx + marker.length));
    await createClient(url, key).storage.from(LEGACY_BUCKET).remove([path]);
  } catch {
    /* non-fatal */
  }
}
