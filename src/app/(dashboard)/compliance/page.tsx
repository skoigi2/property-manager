"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useProperty } from "@/lib/property-context";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { formatDate } from "@/lib/date-utils";
import { formatKSh } from "@/lib/currency";
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, Target, DollarSign,
  Calendar, Building2, Wrench, ChevronRight, Settings,
} from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KPIs {
  occupancyRate:             number | null;
  rentCollectionRate:        number | null;
  expenseRatio:              number | null;
  renewalRate:               number | null;
  avgDaysToLease:            number | null;
  emergencySlaRate:          number | null;
  standardSlaRate:           number | null;
  maintenanceCompletionRate: number | null;
}

interface Targets {
  occupancy:             number;
  rentCollection:        number;
  expenseRatio:          number;
  tenantTurnover:        number;
  daysToLease:           number;
  renewalRate:           number;
  maintenanceCompletion: number;
  emergencyHrs:          number;
  standardHrs:           number;
  vacancyFeeThresholdMonths: number;
  repairAuthorityLimit:  number;
  rentRemittanceDay:     number;
  mgmtFeeInvoiceDay:     number;
}

interface LongVacantUnit {
  id: string;
  unitNumber: string;
  propertyId: string;
  propertyName: string;
  vacantSince: string;
  daysVacant: number;
}

interface ApprovalJob {
  id: string;
  title: string;
  cost: number | null;
  reportedDate: string;
  property: { name: string };
  unit: { unitNumber: string } | null;
}

interface Deadline {
  label: string;
  dueDate: string;
  dayOfMonth: number;
  done: boolean;
  overdue: boolean;
  daysUntil: number;
}

interface ComplianceData {
  period:       { year: number; month: number };
  agreement:    any;
  targets:      Targets;
  kpis:         KPIs;
  counts:       Record<string, number>;
  longVacant:   LongVacantUnit[];
  approvalQueue: ApprovalJob[];
  deadlines:    Deadline[];
}

// ── RAG Logic ─────────────────────────────────────────────────────────────────

type RAG = "green" | "amber" | "red" | "gray";

function getRag(value: number | null, target: number, higherIsBetter: boolean, tolerance = 5): RAG {
  if (value === null) return "gray";
  if (higherIsBetter) {
    if (value >= target)            return "green";
    if (value >= target - tolerance) return "amber";
    return "red";
  } else {
    // Lower is better (e.g. expense ratio, days to lease)
    if (value <= target)            return "green";
    if (value <= target + tolerance) return "amber";
    return "red";
  }
}

function RagIcon({ rag }: { rag: RAG }) {
  if (rag === "green") return <CheckCircle2 size={16} className="text-income" />;
  if (rag === "amber") return <AlertTriangle size={16} className="text-yellow-500" />;
  if (rag === "red")   return <XCircle      size={16} className="text-red-500" />;
  return <Clock size={16} className="text-gray-300" />;
}

const RAG_BADGE: Record<RAG, "green"|"amber"|"red"|"gray"> = {
  green: "green", amber: "amber", red: "red", gray: "gray",
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, target, unit = "%", higherIsBetter = true, tolerance, suffix = "", href,
}: {
  label: string; value: number | null; target: number; unit?: string;
  higherIsBetter?: boolean; tolerance?: number; suffix?: string; href?: string;
}) {
  const rag = getRag(value, target, higherIsBetter, tolerance);
  const display = value !== null ? `${value.toFixed(1)}${unit}` : "—";
  const targetDisplay = `${higherIsBetter ? ">" : "<"}${target}${unit}`;

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-xs font-sans text-gray-500 leading-tight pr-2">{label}</p>
        <div className="flex items-center gap-1 shrink-0">
          <RagIcon rag={rag} />
          {href && <ChevronRight size={12} className="text-gray-300" />}
        </div>
      </div>
      <p className={`font-mono text-2xl font-semibold ${
        rag === "green" ? "text-income" : rag === "amber" ? "text-yellow-500" : rag === "red" ? "text-red-500" : "text-gray-300"
      }`}>
        {display}{suffix}
      </p>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-gray-400 font-sans">Target: {targetDisplay}</span>
        <Badge variant={RAG_BADGE[rag]}>
          {rag === "green" ? "On Track" : rag === "amber" ? "At Risk" : rag === "red" ? "Breached" : "No Data"}
        </Badge>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2 hover:shadow-sm hover:border-gray-200 transition-all">
        {inner}
      </Link>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
      {inner}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const DEADLINE_HREFS: Record<string, string> = {
  "Rent Remittance":        "/invoices",
  "Management Fee Invoice": "/invoices?tab=owner",
};

export default function CompliancePage() {
  const { data: session } = useSession();
  const { selectedId } = useProperty();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (selectedId) params.set("propertyId", selectedId);
    fetch(`/api/compliance?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedId, year, month]);

  useEffect(() => { load(); }, [load]);

  const propertyIdForAgreement = selectedId || "";

  return (
    <div>
      <Header
        title="Compliance"
        userName={session?.user?.name ?? session?.user?.email}
        role={session?.user?.role}
      />

      <div className="page-container space-y-6">
        {/* ── Period selector + Configure Agreement ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <select
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 font-sans bg-white"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 font-sans bg-white"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {propertyIdForAgreement && (
            <Link
              href={`/properties/${propertyIdForAgreement}/agreement`}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-header font-sans border border-gray-200 rounded-lg px-3 py-1.5 transition-colors bg-white"
            >
              <Settings size={13} />
              Configure Agreement
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
        ) : !data ? (
          <div className="text-center py-20 text-gray-400 text-sm font-sans">
            Failed to load compliance data
          </div>
        ) : (
          <>
            {/* ── Agreement Summary ── */}
            {data.agreement ? (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center">
                    <Target size={14} className="text-gold" />
                  </div>
                  <h2 className="font-display text-header text-sm">Agreement Terms</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm font-sans">
                  <div><p className="text-gray-400 text-xs">Mgmt Fee</p><p className="font-semibold text-header">{data.agreement.managementFeeRate}%</p></div>
                  <div><p className="text-gray-400 text-xs">Letting Fee</p><p className="font-semibold text-header">{data.agreement.newLettingFeeRate}% of first month</p></div>
                  <div><p className="text-gray-400 text-xs">Renewal Fee</p><p className="font-semibold text-header">{formatKSh(data.agreement.leaseRenewalFeeFlat)}</p></div>
                  <div><p className="text-gray-400 text-xs">Repair Limit</p><p className="font-semibold text-header">{formatKSh(data.agreement.repairAuthorityLimit)}</p></div>
                  <div><p className="text-gray-400 text-xs">Vacancy Fee</p><p className="font-semibold text-header">{data.agreement.vacancyFeeRate}% after {data.agreement.vacancyFeeThresholdMonths} months</p></div>
                  <div><p className="text-gray-400 text-xs">Rent Remittance</p><p className="font-semibold text-header">{data.agreement.rentRemittanceDay}th of month</p></div>
                  <div><p className="text-gray-400 text-xs">Mgmt Invoice</p><p className="font-semibold text-header">{data.agreement.mgmtFeeInvoiceDay}th of month</p></div>
                  <div><p className="text-gray-400 text-xs">KPI Start</p><p className="font-semibold text-header">{data.agreement.kpiStartDate ? formatDate(new Date(data.agreement.kpiStartDate)) : "Not set"}</p></div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-sans text-gray-500">
                    <AlertTriangle size={16} className="text-yellow-500" />
                    No management agreement configured for this property.
                  </div>
                  {propertyIdForAgreement && (
                    <Link href={`/properties/${propertyIdForAgreement}/agreement`} className="text-xs text-gold hover:underline font-sans">
                      Set up agreement →
                    </Link>
                  )}
                </div>
              </Card>
            )}

            {/* ── Deadline Alerts ── */}
            {data.deadlines.filter((d) => !d.done).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.deadlines.filter((d) => !d.done).map((d) => {
                  const href = DEADLINE_HREFS[d.label];
                  const colorClass = d.overdue ? "border-red-200 bg-red-50" : d.daysUntil <= 3 ? "border-yellow-200 bg-yellow-50" : "border-gray-100 bg-white";
                  const chevronClass = d.overdue ? "text-red-300" : d.daysUntil <= 3 ? "text-yellow-300" : "text-gray-300";
                  const inner = (
                    <>
                      <Calendar size={18} className={d.overdue ? "text-red-500 shrink-0" : d.daysUntil <= 3 ? "text-yellow-500 shrink-0" : "text-gray-400 shrink-0"} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold font-sans text-header">{d.label}</p>
                        <p className="text-xs text-gray-500 font-sans">
                          Due {d.dayOfMonth}{d.dayOfMonth === 1 ? "st" : d.dayOfMonth === 2 ? "nd" : d.dayOfMonth === 3 ? "rd" : "th"} of the month
                          {" — "}
                          {d.overdue
                            ? <span className="text-red-600 font-semibold">OVERDUE by {Math.abs(d.daysUntil)} day{Math.abs(d.daysUntil) !== 1 ? "s" : ""}</span>
                            : <span className={d.daysUntil <= 3 ? "text-yellow-600 font-semibold" : "text-gray-500"}>{d.daysUntil} day{d.daysUntil !== 1 ? "s" : ""} away</span>
                          }
                        </p>
                      </div>
                      {href && <ChevronRight size={14} className={`${chevronClass} shrink-0`} />}
                    </>
                  );
                  return href ? (
                    <Link key={d.label} href={href} className={`rounded-xl border p-4 flex items-center gap-3 hover:shadow-sm transition-all ${colorClass}`}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={d.label} className={`rounded-xl border p-4 flex items-center gap-3 ${colorClass}`}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── KPI Scorecard ── */}
            <div>
              <h2 className="font-display text-header text-sm mb-3">KPI Scorecard — {MONTHS[month - 1]} {year}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Occupancy Rate"
                  value={data.kpis.occupancyRate}
                  target={data.targets.occupancy}
                  href="/properties"
                />
                <KpiCard
                  label="Rent Collection Rate"
                  value={data.kpis.rentCollectionRate}
                  target={data.targets.rentCollection}
                  href="/income"
                />
                <KpiCard
                  label="Expense Ratio"
                  value={data.kpis.expenseRatio}
                  target={data.targets.expenseRatio}
                  higherIsBetter={false}
                  tolerance={5}
                  href="/expenses"
                />
                <KpiCard
                  label="Lease Renewal Rate"
                  value={data.kpis.renewalRate}
                  target={data.targets.renewalRate}
                  href="/tenants"
                />
                <KpiCard
                  label="Avg Days to Lease"
                  value={data.kpis.avgDaysToLease}
                  unit=" days"
                  target={data.targets.daysToLease}
                  higherIsBetter={false}
                  tolerance={10}
                  href="/properties"
                />
                <KpiCard
                  label={`Emergency SLA (< ${data.targets.emergencyHrs}hrs)`}
                  value={data.kpis.emergencySlaRate}
                  target={data.targets.maintenanceCompletion}
                  href="/maintenance"
                />
                <KpiCard
                  label={`Standard SLA (< ${data.targets.standardHrs}hrs)`}
                  value={data.kpis.standardSlaRate}
                  target={data.targets.maintenanceCompletion}
                  href="/maintenance"
                />
                <KpiCard
                  label="Maintenance Completion"
                  value={data.kpis.maintenanceCompletionRate}
                  target={data.targets.maintenanceCompletion}
                  href="/maintenance"
                />
              </div>
              {/* Counts context */}
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400 font-sans">
                <span>{data.counts.activeUnits}/{data.counts.totalUnits} units occupied</span>
                <span>{formatKSh(data.counts.totalCollected)} / {formatKSh(data.counts.totalExpected)} collected</span>
                <span>{data.counts.doneJobsCount}/{data.counts.totalJobsCount} jobs done</span>
                <span>{data.counts.renewedCount}/{data.counts.renewalsDueCount} renewals completed</span>
              </div>
            </div>

            {/* ── Long-vacant Units ── */}
            {data.longVacant.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center">
                    <Building2 size={14} className="text-yellow-500" />
                  </div>
                  <div>
                    <h2 className="font-display text-header text-sm">Long-vacant Units</h2>
                    <p className="text-xs text-gray-400 font-sans">Vacant over {data.targets.vacancyFeeThresholdMonths} months — vacancy fee may apply</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {data.longVacant.map((u) => (
                    <Link key={u.id} href="/properties" className="flex items-center justify-between p-3 rounded-lg bg-yellow-50/60 border border-yellow-100 hover:bg-yellow-50 hover:border-yellow-200 transition-colors">
                      <div>
                        <p className="text-sm font-semibold font-sans text-header">Unit {u.unitNumber} — {u.propertyName}</p>
                        <p className="text-xs text-gray-500 font-sans">Vacant since {formatDate(new Date(u.vacantSince))} · {u.daysVacant} days</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="amber">{Math.floor(u.daysVacant / 30)} months</Badge>
                        <ChevronRight size={14} className="text-yellow-400 shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Approval Queue ── */}
            {data.approvalQueue.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                    <Wrench size={14} className="text-red-500" />
                  </div>
                  <div>
                    <h2 className="font-display text-header text-sm">Repair Approval Queue</h2>
                    <p className="text-xs text-gray-400 font-sans">Jobs exceeding repair authority limit requiring landlord written approval</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {data.approvalQueue.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50/40 border border-red-100">
                      <div>
                        <p className="text-sm font-semibold font-sans text-header">{job.title}</p>
                        <p className="text-xs text-gray-500 font-sans">
                          {job.property.name}{job.unit ? ` · Unit ${job.unit.unitNumber}` : ""} · Reported {formatDate(new Date(job.reportedDate))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.cost && <span className="text-sm font-mono font-semibold text-red-600">{formatKSh(job.cost)}</span>}
                        <Link href="/maintenance" className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100">
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
