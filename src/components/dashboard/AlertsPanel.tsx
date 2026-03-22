import { clsx } from "clsx";
import { AlertTriangle, Clock, Wallet } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { formatKSh } from "@/lib/currency";

interface AlertsPanelProps {
  leaseAlerts: { tenantName: string; unitNumber: string; leaseEnd: Date | null; days: number | null; status: string }[];
  noRentAlerts: { tenantName: string; unitNumber: string }[];
  noIncomeAlerts: { unitNumber: string }[];
  pettyCashDeficit: boolean;
  pettyCashBalance: number;
  mgmtFeeBalance: number;
}

export function AlertsPanel({
  leaseAlerts,
  noRentAlerts,
  noIncomeAlerts,
  pettyCashDeficit,
  pettyCashBalance,
  mgmtFeeBalance,
}: AlertsPanelProps) {
  const allAlerts: { key: string; message: string; severity: "critical" | "warning" }[] = [];

  // Critical: expired leases or outstanding rent
  leaseAlerts.filter((a) => a.status === "CRITICAL").forEach((a) => {
    allAlerts.push({ key: `lease-crit-${a.unitNumber}`, message: `${a.tenantName} (${a.unitNumber}): Lease EXPIRED`, severity: "critical" });
  });
  leaseAlerts.filter((a) => a.status === "TBC").forEach((a) => {
    allAlerts.push({ key: `lease-tbc-${a.unitNumber}`, message: `${a.tenantName} (${a.unitNumber}): Lease expiry TBC — update immediately`, severity: "critical" });
  });
  noRentAlerts.forEach((a) => {
    allAlerts.push({ key: `no-rent-${a.unitNumber}`, message: `No rent logged for ${a.tenantName} (${a.unitNumber}) this month`, severity: "critical" });
  });

  // Warning: expiring leases, no income
  leaseAlerts.filter((a) => a.status === "WARNING").forEach((a) => {
    allAlerts.push({ key: `lease-warn-${a.unitNumber}`, message: `${a.tenantName} (${a.unitNumber}): Lease expires ${a.leaseEnd ? formatDate(a.leaseEnd) : "soon"} (${a.days} days)`, severity: "warning" });
  });
  noIncomeAlerts.forEach((a) => {
    allAlerts.push({ key: `no-income-${a.unitNumber}`, message: `${a.unitNumber}: Has fixed costs but zero income — owner-occupied or vacant?`, severity: "warning" });
  });
  if (pettyCashDeficit) {
    allAlerts.push({ key: "petty-cash", message: `Petty cash deficit: ${formatKSh(pettyCashBalance)}`, severity: "critical" });
  }
  if (mgmtFeeBalance < 0) {
    allAlerts.push({ key: "mgmt-fee", message: `Management fee outstanding: ${formatKSh(Math.abs(mgmtFeeBalance))}`, severity: "warning" });
  }

  if (allAlerts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p className="text-sm text-green-700 font-sans font-medium">All clear — no alerts for this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allAlerts.map((alert) => (
        <div
          key={alert.key}
          className={clsx(
            "flex items-start gap-3 rounded-xl p-3.5",
            alert.severity === "critical" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
          )}
        >
          <AlertTriangle
            size={16}
            className={clsx("shrink-0 mt-0.5", alert.severity === "critical" ? "text-expense" : "text-amber-500")}
          />
          <p className={clsx("text-sm font-sans", alert.severity === "critical" ? "text-expense" : "text-amber-700")}>
            {alert.message}
          </p>
        </div>
      ))}
    </div>
  );
}
