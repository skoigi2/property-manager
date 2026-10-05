import type {
  InspectionItem, InspectionKey, InspectionStatus, InspectionType, KeysState, TenantSignOff,
} from "@/lib/inspection-rules";

/** GET /api/condition-reports/[id] — see serializeInspection in src/lib/inspections.ts. */
export interface InspectionDto {
  id: string;
  reportType: InspectionType;
  status: InspectionStatus;
  reportDate: string;
  scheduledFor: string | null;
  unit: { id: string; unitNumber: string; type: string };
  property: { id: string; name: string };
  tenant: {
    id: string; name: string; phone: string | null; leaseStart: string | null; nationalId: string | null;
    email?: string | null; leaseEnd?: string | null;
  } | null;
  assignedTo: { id: string; name: string | null } | null;
  items: InspectionItem[];
  overallComments: string | null;
  tenantIssues: string | null;
  keys: InspectionKey[];
  keysState: KeysState;
  keysClearedAt: string | null;
  tenantSignOff: TenantSignOff | null;
  tenantSignedName: string | null;
  tenantSignedAt: string | null;
  tenantSignatureUrl: string | null;
  tenantDisagrees: boolean;
  tenantComments: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  acceptedAt: string | null;
  reviewNote: string | null;
  editRequestedAt: string | null;
  editRequestReason: string | null;
  sentToTenantAt: string | null;
  vaulted: boolean;
  photos: { id: string; fileName: string; uploadedAt: string; url: string | null }[];
  baseline: { id: string; reportDate: string; items: InspectionItem[]; photos: { id: string; url: string | null }[] } | null;
  viewer: { isManager: boolean; userId: string };
}

/** The move-in condition of the same room + feature, for comparison. */
export function baselineFor(baseline: InspectionDto["baseline"], room: string, feature: string): InspectionItem | null {
  if (!baseline) return null;
  const r = room.trim().toLowerCase(), f = feature.trim().toLowerCase();
  return baseline.items.find((i) => i.room.trim().toLowerCase() === r && i.feature.trim().toLowerCase() === f) ?? null;
}

export async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : fallback;
}
