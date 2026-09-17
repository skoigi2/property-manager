// Client-side photo compression shared by the expense-receipt uploader and the
// meter-reading camera capture: phone photos are 4–8 MB, a legible receipt or
// meter dial needs a fraction of that. Browser-only (canvas).

/** Types the canvas can decode — candidates for client-side compression. */
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const COMPRESS_THRESHOLD = 1_500_000; // bytes — smaller files upload as-is
const MAX_DIMENSION = 2200; // px — plenty for a legible receipt

/** Downscale + re-encode large canvas-decodable images; anything else passes through. */
export async function maybeCompressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < COMPRESS_THRESHOLD) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file; // keep original if no win
    const newName = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file; // decode failed — upload the original
  }
}
