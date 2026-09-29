import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Meter photo check: Claude reads the number off the photo(s) a reading was
// saved with, so a mistyped digit is caught at the meter instead of on the
// tenant's bill. It only ever FLAGS a difference (photoReadingMismatch in
// utility-billing.ts) — the typed reading is never changed.
//
// Off unless ANTHROPIC_API_KEY is set. Never throws and never blocks a save:
// no key, an unsupported image (HEIC), a refusal, a timeout or an API error
// all simply leave the reading unchecked.

const MODEL = "claude-opus-5-5";
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const MeterReadSchema = z.object({
  readable: z.boolean(),
  reading: z.number().nullable(),
  note: z.string(),
});

export function meterPhotoCheckEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // A slow answer must not hold up the caretaker at the meter for long.
  client ??= new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}

export interface MeterPhotoContext {
  utility: "WATER" | "ELECTRICITY";
  unitLabel: string;
  meterNumber: string | null;
  previousReading: number;
}

export interface MeterPhotoRead {
  reading: number | null;
  note: string;
}

/** Reads the meter register from up to three photos. Null = not checked. */
export async function readMeterPhotos(files: File[], ctx: MeterPhotoContext): Promise<MeterPhotoRead | null> {
  if (!meterPhotoCheckEnabled()) return null;
  const images = files.filter((f) => SUPPORTED_TYPES.has(f.type)).slice(0, 3);
  if (images.length === 0) return null;

  try {
    const imageBlocks = await Promise.all(
      images.map(async (f) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: f.type as ImageMediaType,
          data: Buffer.from(await f.arrayBuffer()).toString("base64"),
        },
      })),
    );
    const kind = ctx.utility === "WATER" ? "water" : "electricity";
    const response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(MeterReadSchema) },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: [
                `${images.length > 1 ? "These photos show" : "This photo shows"} a ${kind} meter${ctx.meterNumber ? ` (meter no. ${ctx.meterNumber})` : ""}, taken for a monthly reading in ${ctx.unitLabel}.`,
                "Read the cumulative register — the row of digits (drums or display) that counts total consumption. Ignore serial numbers, model numbers and printed labels.",
                "Include the digits after the decimal point if the register shows them (often red drums or a separate window). A drum caught between two digits counts as the lower one.",
                `Last month's reading was ${ctx.previousReading}; use it only to tell where the decimal point falls and how many digits the register has — report what the photo actually shows, even if it is lower.`,
                "If the register is blurred, cut off, covered or you are not sure of any digit, set readable to false and reading to null and say why in note. Otherwise set readable to true, reading to the number, and note to a few words on what you read.",
              ].join("\n"),
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const out = response.parsed_output;
    if (!out) return null;
    if (!out.readable || out.reading === null || !Number.isFinite(out.reading) || out.reading < 0) {
      return { reading: null, note: out.note.slice(0, 300) || "The register could not be read from the photo." };
    }
    return { reading: out.reading, note: out.note.slice(0, 300) };
  } catch (e) {
    console.warn("[meter-photo-reader] photo check skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Reads the photos a reading was just saved with and stores the result on the
 * reading. Returns what was stored (null = nothing checked, reading untouched).
 */
export async function recordMeterPhotoCheck(
  readingId: string,
  files: File[],
  ctx: MeterPhotoContext,
): Promise<MeterPhotoRead | null> {
  const read = await readMeterPhotos(files, ctx);
  if (!read) return null;
  await prisma.meterReading
    .update({
      where: { id: readingId },
      data: { photoReading: read.reading, photoReadingNote: read.note, photoCheckedAt: new Date() },
    })
    .catch(() => {});
  return read;
}
