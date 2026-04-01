import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle, XCircle, Clock,
  Wallet, DollarSign, ArrowRight, TrendingDown,
} from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/currency";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LeaseAlert {
  tenantId:    string;
  tenantName:  string;
  unitNumber:  string;
  leaseEnd:    Date | null;
  days:        number | null;
  status:      string;
}

interface NoRentAlert {
  tenantId:   string;
  tenantName: string;
  unitNumber: string;
}

interface NoIncomeAlert {
  unitNumber: string;
}

interface ArrearsAlert {
  tenantId:    string;
  tenantName:  string;
  unitNumber:  string;
  monthsUnpaid: number;
  totalArrears: number;
}

interface AlertsPanelProps {
  leaseAlerts:      LeaseAlert[];
  noRentAlerts:     NoRentAlert[];
  noIncomeAlerts:   NoIncomeAlert[];
  arrearsAlerts?:   ArrearsAlert[];
  pettyCashDeficit: boolean;
  pettyCashBalance: number;
  mgmtFeeBalance:   number;
  currency?:        string;
}

// ── Internal alert shape ───────────────────────────────────────────────────────

type Severity = "critical" | "warning";

interface AlertItem {
  key:      string;
  severity: Severity;
  icon:     React.ReactNode;
  message:  string;
  sub?:     string;
  pill?:    { label: string; color: string };
  action?:  { label: string; href: string };
}

// ── Days pill ─────────────────────────────────────────────────────────────────

function DaysPill({ days, status }: { days: number | null; status: string }) {
  if (days === null) return null;

  const { bg, text, label } =
    status === "CRITICAL"
      ? { bg: "bg-red-100",    text: "text-red-700",    label: days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left` }
      : { bg: "bg-amber-100",  text: "text-amber-700",  label: `${days}d left` };

  return (
    <span className={clsx("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium ml-1.5 shrink-0", bg, text)}>
      {label}
    </span>
  );
}

// ── Single alert row ──────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: AlertItem }) {
  const router = useRouter();
  const isCrit = alert.severity === "critical";

  return (
    <div className={clsx(
      "flex items-start gap-3 rounded-xl p-3.5 group",
      isCrit
        ? "bg-red-50 border border-red-100"
        : "bg-amber-50 border border-amber-100",
    )}>
      {/* Icon */}
      <span className={clsx("shrink-0 mt-0.5", isCrit ? "text-expense" : "text-amber-500")}>
        {alert.icon}
      </span>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
          <p className={clsx("text-sm font-sans font-medium leading-snug", isCrit ? "text-red-800" : "text-amber-800")}>
            {alert.message}
          </p>
          {alert.pill && (
            <span className={clsx("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium shrink-0", alert.pill.color)}>
              {alert.pill.label}
            </span>
          )}
        </div>
        {alert.sub && (
          <p className={clsx("text-xs font-sans mt-0.5", isCrit ? "text-red-600" : "text-amber-600")}>
            {alert.sub}
          </p>
        )}
      </div>

      {/* Action */}
      {alert.action && (
        <button
          onClick={() => router.push(alert.action!.href)}
          className={clsx(
            "shrink-0 flex items-center gap-1 text-xs font-medium font-sans px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap",
            isCrit
              ? "bg-red-100 text-red-700 hover:bg-red-200"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200",
          )}
        >
          {alert.action.label}
          <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function AlertSection({ severity, alerts }: { severity: Severity; alerts: AlertItem[] }) {
  if (alerts.length === 0) return null;
  const isCrit = severity === "critical";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={clsx(
          "flex items-center gap-1.5 text-xs font-medium font-sans uppercase tracking-wide",
          isCrit ? "text-expense" : "text-amber-600",
        )}>
          {isCrit ? <XCircle size={13} /> : <AlertTriangle size={13} />}
          {isCrit ? "Critical" : "Warning"}
        </span>
        <span className={clsx(
          "text-xs font-mono font-bold px-1.5 py-0.5 rounded-full",
          isCrit ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
        )}>
          {alerts.length}
        </span>
      </div>
      <div className="space-y-2">
        {alerts.map((a) => <AlertRow key={a.key} alert={a} />)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AlertsPanel({
  leaseAlerts,
  noRentAlerts,
  noIncomeAlerts,
  arrearsAlerts = [],
  pettyCashDeficit,
  pettyCashBalance,
  mgmtFeeBalance,
  currency = "KES",
}: AlertsPanelProps) {
  const fmt = (n: number) => formatCurrency(n, currency);

  const critical: AlertItem[] = [];
  const warnings: AlertItem[] = [];

  // ── Lease EXPIRED ───────────────────────────────────────────────────────────
  leaseAlerts.filter((a) => a.status === "CRITICAL").forEach((a) => {
    critical.push({
      key:      `lease-crit-${a.unitNumber}`,
      severity: "critical",
      icon:     <XCircle size={16} />,
      message:  `${a.tenantName} (${a.unitNumber}) — lease expired`,
      sub:      a.leaseEnd ? `Expired ${formatDate(a.leaseEnd)}` : undefined,
      pill:     a.days !== null
        ? { label: `${Math.abs(a.days)}d overdue`, color: "bg-red-100 text-red-700" }
        : undefined,
      action:   { label: "View tenant", href: `/tenants/${a.tenantId}` },
    });
  });

  // ── Lease TBC ───────────────────────────────────────────────────────────────
  leaseAlerts.filter((a) => a.status === "TBC").forEach((a) => {
    critical.push({
      key:      `lease-tbc-${a.unitNumber}`,
      severity: "critical",
      icon:     <Clock size={16} />,
      message:  `${a.tenantName} (${a.unitNumber}) — lease expiry TBC`,
      sub:      "No end date on record — update immediately",
      pill:     { label: "TBC", color: "bg-red-100 text-red-700" },
      action:   { label: "View tenant", href: `/tenants/${a.tenantId}` },
    });
  });

  // ── No rent this month ──────────────────────────────────────────────────────
  noRentAlerts.forEach((a) => {
    critical.push({
      key:      `no-rent-${a.unitNumber}`,
      severity: "critical",
      icon:     <AlertTriangle size={16} />,
      message:  `${a.tenantName} (${a.unitNumber}) — no rent this month`,
      sub:      "No income entry recorded for the current period",
      action:   { label: "Record", href: `/income` },
    });
  });

  // ── Petty cash deficit ──────────────────────────────────────────────────────
  if (pettyCashDeficit) {
    critical.push({
      key:      "petty-cash",
      severity: "critical",
      icon:     <Wallet size={16} />,
      message:  `Petty cash deficit`,
      sub:      `Balance: ${fmt(pettyCashBalance)}`,
      pill:     { label: fmt(Math.abs(pettyCashBalance)), color: "bg-red-100 text-red-700" },
      action:   { label: "Top up", href: `/petty-cash` },
    });
  }

  // ── Multi-month arrears ─────────────────────────────────────────────────────
  arrearsAlerts.forEach((a) => {
    critical.push({
      key:      `arrears-${a.tenantId}`,
      severity: "critical",
      icon:     <TrendingDown size={16} />,
      message:  `${a.tenantName} (${a.unitNumber}) — ${a.monthsUnpaid} months in arrears`,
      sub:      `Total outstanding: ${fmt(a.totalArrears)}`,
      pill:     { label: `${a.monthsUnpaid} mo`, color: "bg-red-100 text-red-700" },
      action:   { label: "View arrears", href: `/income` },
    });
  });

  // ── Lease expiring soon ─────────────────────────────────────────────────────
  leaseAlerts.filter((a) => a.status === "WARNING").forEach((a) => {
    warnings.push({
      key:      `lease-warn-${a.unitNumber}`,
      severity: "warning",
      icon:     <Clock size={16} />,
      message:  `${a.tenantName} (${a.unitNumber}) — lease expiring soon`,
      sub:      a.leaseEnd ? `Expires ${formatDate(a.leaseEnd)}` : undefined,
      pill:     a.days !== null
        ? { label: `${a.days}d left`, color: "bg-amber-100 text-amber-700" }
        : undefined,
      action:   { label: "View tenant", href: `/tenants/${a.tenantId}` },
    });
  });

  // ── Airbnb unit: costs but no income ───────────────────────────────────────
  noIncomeAlerts.forEach((a) => {
    warnings.push({
      key:      `no-income-${a.unitNumber}`,
      severity: "warning",
      icon:     <AlertTriangle size={16} />,
      message:  `${a.unitNumber} — fixed costs but zero income`,
      sub:      "Owner-occupied or vacant? Consider logging income or pausing costs",
      action:   { label: "Log income", href: `/income` },
    });
  });

  // ── Management fee outstanding ──────────────────────────────────────────────
  if (mgmtFeeBalance < 0) {
    warnings.push({
      key:      "mgmt-fee",
      severity: "warning",
      icon:     <DollarSign size={16} />,
      message:  "Management fee outstanding",
      sub:      `Unpaid: ${fmt(Math.abs(mgmtFeeBalance))}`,
      pill:     { label: fmt(Math.abs(mgmtFeeBalance)), color: "bg-amber-100 text-amber-700" },
      action:   { label: "Log payment", href: `/expenses` },
    });
  }

  const totalCount = critical.length + warnings.length;

  // ── All clear ───────────────────────────────────────────────────────────────
  if (totalCount === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <CheckCircle size={16} className="text-income" />
        </div>
        <p className="text-sm text-green-700 font-sans font-medium">All clear — no alerts for this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-sans text-gray-500">
          {totalCount} alert{totalCount !== 1 ? "s" : ""}
        </span>
        {critical.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium font-sans bg-red-100 text-red-700 px-2.5 py-1 rounded-full">
            <XCircle size={12} />
            {critical.length} critical
          </span>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium font-sans bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
            <AlertTriangle size={12} />
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Critical section */}
      <AlertSection severity="critical" alerts={critical} />

      {/* Warning section */}
      <AlertSection severity="warning" alerts={warnings} />
    </div>
  );
}
