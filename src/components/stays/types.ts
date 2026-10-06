import type { InspectionKey, InspectionStatus } from "@/lib/inspection-rules";
import { stayStage, type StayIdState, type StayStage } from "@/lib/stay-rules";

// GET /api/stays and /api/stays/[id] — see src/lib/stays.ts. No money, ever.

export interface StayRecordDto {
  idOverrideReason: string | null;
  idOverrideAt: string | null;
  idOverrideByName: string | null;
  keysHanded: InspectionKey[];
  keysHandedAt: string | null;
  keysHandedByName: string | null;
  keysReturnedAt: string | null;
  keysReturnedByName: string | null;
  cleanerName: string | null;
  cleanerKeysOutAt: string | null;
  cleanerKeysOutByName: string | null;
  cleanerKeysBackAt: string | null;
  cleanerKeysBackByName: string | null;
}

export interface StayInspectionDto {
  id: string;
  status: InspectionStatus;
  submittedAt: string | null;
  acceptedAt: string | null;
  damaged: number;
}

interface StayCore {
  id: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  platform: string | null;
  unit: { id: string; unitNumber: string };
  property: { id: string; name: string };
  idState: StayIdState;
  stay: StayRecordDto;
}

export interface StaySummaryDto extends StayCore {
  guestCount: number;
  mainGuestName: string | null;
  inspection: StayInspectionDto | null;
}

export interface StayGuestDto {
  id: string;
  name: string;
  phone: string | null;
  nationality: string | null;
  idNumber: string | null;
  isPrimary: boolean;
  documents: { id: string; label: string; fileName: string; mimeType: string | null; uploadedAt: string; url: string | null; canDelete: boolean }[];
}

export interface StayDto extends StayCore {
  guests: StayGuestDto[];
  inspections: StayInspectionDto[];
  viewer: { isManager: boolean; userId: string };
}

export const PLATFORM_LABEL: Record<string, string> = {
  AIRBNB: "Airbnb", BOOKING_COM: "Booking.com", DIRECT: "Direct", AGENT: "Agent",
};

/** The viewer's local day as yyyy-mm-dd. */
export function localDay(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** Formats a stored date-only value (UTC midnight) without shifting the day. */
export function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", opts);
}

export function stageOf(s: StayCore & { inspection?: StayInspectionDto | null; inspections?: StayInspectionDto[] }, today: string): StayStage {
  const insp = s.inspection ?? s.inspections?.[0] ?? null;
  return stayStage({
    ...s.stay,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    inspectionHandedIn: !!insp && (insp.status === "SUBMITTED" || insp.status === "ACCEPTED"),
  }, today);
}

export async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : fallback;
}
