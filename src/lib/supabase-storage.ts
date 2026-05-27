import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "tenant-documents";
export const CASE_BUCKET = "case-attachments";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }
  _client = createClient(url, key);
  return _client;
}

export async function uploadToStorage(
  path: string,
  buffer: Buffer,
  contentType: string
) {
  const { error } = await getClient()
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);
}

export async function deleteFromStorage(path: string) {
  const { error } = await getClient().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function getSignedUrl(path: string, expiresIn = 3600) {
  const { data, error } = await getClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function uploadCaseAttachment(
  threadId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const path = `${threadId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await getClient()
    .storage.from(CASE_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function getCaseAttachmentSignedUrl(path: string, expiresIn = 3600) {
  const { data, error } = await getClient()
    .storage.from(CASE_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
