import type {
  CaseStatus,
  CaseWaitingOn,
  MaintenanceJob,
  MaintenanceStatus,
} from "@prisma/client";

export function mapMaintenanceStatusToCase(s: MaintenanceStatus): CaseStatus {
  switch (s) {
    case "OPEN":           return "OPEN";
    case "IN_PROGRESS":    return "IN_PROGRESS";
    case "AWAITING_PARTS": return "AWAITING_VENDOR";
    case "DONE":           return "RESOLVED";
    case "CANCELLED":      return "CLOSED";
  }
}

export function mapMaintenanceWaitingOn(
  job: Pick<MaintenanceJob, "status" | "vendorId">
): CaseWaitingOn {
  switch (job.status) {
    case "OPEN":           return "MANAGER";
    case "IN_PROGRESS":    return job.vendorId ? "VENDOR" : "MANAGER";
    case "AWAITING_PARTS": return "VENDOR";
    case "DONE":
    case "CANCELLED":      return "NONE";
  }
}

export function summariseStatusChange(from: CaseStatus, to: CaseStatus): string {
  return `Status changed from ${from} to ${to}`;
}
