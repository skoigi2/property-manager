"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { incomeEntrySchema, type IncomeEntryInput } from "@/lib/validations";
import { formatDate } from "@/lib/date-utils";
import {
  Trash2, Plus, TrendingUp, User, CheckCircle2, AlertCircle,
  LayoutList, TableProperties, Receipt, ChevronDown, ChevronRight, ChevronUp,
  RefreshCw, AlertTriangle, Loader2, Zap, FolderOpen,
  DollarSign, CheckCheck, Clock, FileDown, ChevronsUpDown, GripVertical,
} from "lucide-react";
import { exportIncome } from "@/lib/excel-export";
import Link from "next/link";
import { clsx } from "clsx";
import { useProperty } from "@/lib/property-context";

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENTS = ["Maggie", "Audrey", "Brenda", "Koka", "Other"];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const INCOME_TYPE_LABELS: Record<string, { label: string; badge: "blue"|"gold"|"green"|"amber"|"gray" }> = {
  LONGTERM_RENT:    { label: "Rent",           badge: "blue" },
  SERVICE_CHARGE:   { label: "Service Charge", badge: "amber" },
  DEPOSIT:          { label: "Deposit",        badge: "gray" },
  AIRBNB:           { label: "Airbnb",         badge: "gold" },
  UTILITY_RECOVERY: { label: "Utility Rec.",   badge: "green" },
  OTHER:            { label: "Other",          badge: "gray" },
};

const PLATFORM_LABELS: Record<string, string> = {
  AIRBNB: "Airbnb", BOOKING_COM: "Booking.com", DIRECT: "Direct", AGENT: "Agent",
};

const EXCLUDED_FROM_PL = ["DEPOSIT"];

type Tab = "collection" | "entries" | "commissions";
type CollectionMode = "monthly" | "arrears";

interface MonthRow {
  year: number;
  month: number; // 0-indexed
  expected: number;
  totalPaid: number;
  balance: number; // negative = short
  isPaid: boolean;
  isPartial: boolean;
}

interface ArrearsSummary {
  months: MonthRow[];
  unpaidMonths: MonthRow[];
  totalArrears: number;
  totalMonthsOwed: number;
  lastPaymentDate: string | null;
  hasArrears: boolean;
}

// ── Arrears computation ────────────────────────────────────────────────────────

function computeArrears(tenant: any, allEntries: any[]): ArrearsSummary {
  const leaseStart = new Date(tenant.leaseStart);
  const today = new Date();

  const start = new Date(leaseStart.getFullYear(), leaseStart.getMonth(), 1);
  const end   = new Date(today.getFullYear(), today.getMonth(), 1);

  const tenantEntries = allEntries.filter(
    (e: any) =>
      e.type === "LONGTERM_RENT" &&
      (e.tenantId === tenant.id || e.unitId === tenant.unitId),
  );

  const months: MonthRow[] = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const yr = cursor.getFullYear();
    const mo = cursor.getMonth();

    const paid = tenantEntries
      .filter((e: any) => {
        const d = new Date(e.date);
        return d.getFullYear() === yr && d.getMonth() === mo;
      })
      .reduce((s: number, e: any) => s + e.grossAmount, 0);

    const expected = tenant.monthlyRent ?? 0;
    months.push({
      year: yr,
      month: mo,
      expected,
      totalPaid: paid,
      balance: paid - expected,
      isPaid: paid >= expected * 0.99,
      isPartial: paid > 0 && paid < expected * 0.99,
    });

    cursor = new Date(yr, mo + 1, 1);
  }

  const unpaidMonths = months.filter((m) => !m.isPaid);
  const totalArrears = unpaidMonths.reduce((s, m) => s + Math.max(0, m.expected - m.totalPaid), 0);

  const sorted = [...tenantEntries].sort(
    (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return {
    months,
    unpaidMonths,
    totalArrears,
    totalMonthsOwed: unpaidMonths.length,
    lastPaymentDate: sorted[0]?.date ?? null,
    hasArrears: totalArrears > 0,
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IncomePage() {
  const { data: session } = useSession();
  const { selectedId } = useProperty();

  // Tab & collection mode
  const [tab, setTab]                         = useState<Tab>("collection");
  const [collectionMode, setCollectionMode]   = useState<CollectionMode>("monthly");
  const [expandedRows, setExpandedRows]       = useState<Set<string>>(new Set());

  // Sort (shared, reset on tab change)
  const [sortCol, setSortCol]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");
  const [dragCol, setDragCol]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Column orders (persisted to localStorage)
  const DEFAULT_ENTRIES_COL = ["date","unit","tenant","type","platform","invoice","gross","commission","net"];
  const DEFAULT_COLL_COL    = ["unit","tenant","property","expected","received","status"];
  const [entriesColOrder, setEntriesColOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("income-entries-col-order"); if (s) return JSON.parse(s); } catch {}
    return DEFAULT_ENTRIES_COL;
  });
  const [collColOrder, setCollColOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("income-coll-col-order"); if (s) return JSON.parse(s); } catch {}
    return DEFAULT_COLL_COL;
  });

  // Data
  const [properties, setProperties]           = useState<any[]>([]);
  const [allTenants, setAllTenants]           = useState<any[]>([]);
  const [entries, setEntries]                 = useState<any[]>([]);        // current month
  const [allIncomeEntries, setAllIncomeEntries] = useState<any[]>([]);      // all time (arrears)

  // Loading states
  const [loading, setLoading]                 = useState(true);
  const [tenantsLoading, setTenantsLoading]   = useState(true);
  const [arrearsLoading, setArrearsLoading]   = useState(false);
  const [arrearsSeq, setArrearsSeq]           = useState(0); // increment to re-fetch
  const [openCases, setOpenCases]             = useState<Record<string, string>>({}); // tenantId → caseId
  const [openingCaseFor, setOpeningCaseFor]   = useState<string | null>(null); // tenantId being submitted

  // Form
  const [submitting, setSubmitting]           = useState(false);
  const [deleteId, setDeleteId]               = useState<string | null>(null);
  const [deleting, setDeleting]               = useState(false);
  const [month, setMonth]                     = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [showForm, setShowForm]               = useState(false);
  const [activeTenant, setActiveTenant]       = useState<{ id: string; name: string } | null>(null);
  const [tenantLookupLoading, setTenantLookupLoading] = useState(false);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<IncomeEntryInput>({
      resolver: zodResolver(incomeEntrySchema),
      defaultValues: { type: "LONGTERM_RENT", agentCommission: 0 },
    });

  const incomeType     = watch("type");
  const platform       = watch("platform");
  const selectedUnitId = watch("unitId");

  const allUnits = properties.flatMap((p: any) =>
    (p.units ?? []).map((u: any) => ({ ...u, propertyName: p.name })),
  );

  // ── Fetch: properties & active tenants ────────────────────────────────────
  useEffect(() => {
    fetch("/api/properties").then((r) => r.json()).then(setProperties);
    setTenantsLoading(true);
    fetch(`/api/tenants?activeOnly=true${selectedId ? `&propertyId=${selectedId}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setAllTenants(d); setTenantsLoading(false); })
      .catch(() => setTenantsLoading(false));
  }, [selectedId]);

  // ── Fetch: current-month entries ───────────────────────────────────────────
  const fetchEntries = useCallback(() => {
    setLoading(true);
    const propParam = selectedId ? `&propertyId=${selectedId}` : "";
    fetch(`/api/income?year=${month.getFullYear()}&month=${month.getMonth() + 1}${propParam}`)
      .then((r) => r.json())
      .then((d) => { setEntries(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, selectedId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // ── Fetch: all-time entries for arrears (lazy, re-fetches on arrearsSeq) ──
  useEffect(() => {
    if (collectionMode !== "arrears") return;
    setArrearsLoading(true);
    const propParam = selectedId ? `?propertyId=${selectedId}` : "";
    Promise.all([
      fetch(`/api/income${propParam}`).then((r) => r.json()),
      fetch(`/api/arrears${propParam}`).then((r) => r.json()),
    ])
      .then(([income, cases]) => {
        setAllIncomeEntries(income);
        // Build tenantId → caseId map for open cases
        const caseMap: Record<string, string> = {};
        if (Array.isArray(cases)) {
          cases.filter((c: any) => c.stage !== "RESOLVED").forEach((c: any) => {
            caseMap[c.tenantId] = c.id;
          });
        }
        setOpenCases(caseMap);
        setArrearsLoading(false);
      })
      .catch(() => setArrearsLoading(false));
  }, [collectionMode, arrearsSeq, selectedId]);

  // ── Tenant auto-lookup when unit changes in form ───────────────────────────
  useEffect(() => {
    if (!selectedUnitId || !["LONGTERM_RENT", "SERVICE_CHARGE", "DEPOSIT"].includes(incomeType)) {
      setActiveTenant(null);
      setValue("tenantId", undefined);
      return;
    }
    setTenantLookupLoading(true);
    fetch(`/api/tenants?unitId=${selectedUnitId}&activeOnly=true`)
      .then((r) => r.json())
      .then((tenants: any[]) => {
        const t = tenants.find((t) => t.isActive && t.unitId === selectedUnitId) ?? null;
        setActiveTenant(t ? { id: t.id, name: t.name } : null);
        setValue("tenantId", t?.id ?? undefined);
      })
      .catch(() => setActiveTenant(null))
      .finally(() => setTenantLookupLoading(false));
  }, [selectedUnitId, incomeType, setValue]);

  // ── Monthly collection rows ────────────────────────────────────────────────
  const collectionRows = useMemo(() =>
    allTenants.map((tenant: any) => {
      const paid = entries.filter(
        (e: any) =>
          e.type === "LONGTERM_RENT" &&
          (e.tenantId === tenant.id || e.unitId === tenant.unitId),
      );
      const totalPaid = paid.reduce((s: number, e: any) => s + e.grossAmount, 0);
      const expected  = tenant.monthlyRent ?? 0;
      return { tenant, paid, totalPaid, expected, isPaid: totalPaid >= expected * 0.99 };
    }),
  [allTenants, entries]);

  const collectionSummary = useMemo(() => ({
    total:         collectionRows.length,
    paid:          collectionRows.filter((r) => r.isPaid).length,
    totalExpected: collectionRows.reduce((s, r) => s + r.expected, 0),
    totalReceived: collectionRows.reduce((s, r) => s + r.totalPaid, 0),
  }), [collectionRows]);

  // ── Arrears rows ──────────────────────────────────────────────────────────
  const arrearsRows = useMemo(() => {
    if (arrearsLoading || allIncomeEntries.length === 0 && collectionMode !== "arrears") return [];
    return allTenants
      .map((tenant: any) => ({
        tenant,
        summary: computeArrears(tenant, allIncomeEntries),
      }))
      .sort((a, b) => b.summary.totalArrears - a.summary.totalArrears);
  }, [allTenants, allIncomeEntries, arrearsLoading, collectionMode]);

  const arrearsSummary = useMemo(() => ({
    totalOutstanding: arrearsRows.reduce((s, r) => s + r.summary.totalArrears, 0),
    tenantsWithArrears: arrearsRows.filter((r) => r.summary.hasArrears).length,
    totalMonthsOwed: arrearsRows.reduce((s, r) => s + r.summary.totalMonthsOwed, 0),
  }), [arrearsRows]);

  // ── Sort helpers ────────────────────────────────────────────────────────────
  function handleSort(col: string) {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sortedEntries = useMemo(() => {
    if (!sortCol || tab !== "entries") return entries;
    return [...entries].sort((a: any, b: any) => {
      let cmp = 0;
      if (sortCol === "date")       cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      else if (sortCol === "gross") cmp = a.grossAmount - b.grossAmount;
      else if (sortCol === "commission") cmp = a.agentCommission - b.agentCommission;
      else if (sortCol === "net")   cmp = (a.grossAmount - a.agentCommission) - (b.grossAmount - b.agentCommission);
      else if (sortCol === "unit")  cmp = (a.unit?.unitNumber ?? "").localeCompare(b.unit?.unitNumber ?? "");
      else if (sortCol === "tenant") cmp = (a.tenant?.name ?? "").localeCompare(b.tenant?.name ?? "");
      else if (sortCol === "type")  cmp = a.type.localeCompare(b.type);
      else if (sortCol === "platform") cmp = (a.platform ?? "").localeCompare(b.platform ?? "");
      else if (sortCol === "invoice") cmp = (a.invoice?.invoiceNumber ?? "").localeCompare(b.invoice?.invoiceNumber ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortCol, sortDir, tab]);

  const sortedCollectionRows = useMemo(() => {
    if (!sortCol || tab !== "collection") return collectionRows;
    return [...collectionRows].sort((a: any, b: any) => {
      let cmp = 0;
      if (sortCol === "unit")     cmp = (a.tenant.unit?.unitNumber ?? "").localeCompare(b.tenant.unit?.unitNumber ?? "");
      else if (sortCol === "tenant")   cmp = a.tenant.name.localeCompare(b.tenant.name);
      else if (sortCol === "property") cmp = (a.tenant.unit?.property?.name ?? "").localeCompare(b.tenant.unit?.property?.name ?? "");
      else if (sortCol === "expected") cmp = a.expected - b.expected;
      else if (sortCol === "received") cmp = a.totalPaid - b.totalPaid;
      else if (sortCol === "status")   cmp = (a.isPaid ? 0 : a.totalPaid > 0 ? 1 : 2) - (b.isPaid ? 0 : b.totalPaid > 0 ? 1 : 2);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [collectionRows, sortCol, sortDir, tab]);

  // ── Toggle expanded row ────────────────────────────────────────────────────
  function toggleRow(tenantId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) { next.delete(tenantId); } else { next.add(tenantId); }
      return next;
    });
  }

  // ── Column render helpers ──────────────────────────────────────────────────
  const ENTRIES_SORTABLE = new Set(["date","unit","tenant","type","platform","invoice","gross","commission","net"]);
  const COLL_SORTABLE    = new Set(["unit","tenant","property","expected","received","status"]);
  const INCOME_COL_LABELS: Record<string, string> = {
    date:"Date", unit:"Unit", tenant:"Tenant", type:"Type", platform:"Platform/Agent",
    invoice:"Invoice", gross:"Gross", commission:"Comm.", net:"Net",
    property:"Property", expected:"Expected", received:"Received", status:"Status",
  };

  function renderColHeader(
    key: string,
    colOrder: string[],
    setOrder: (o: string[]) => void,
    lsKey: string,
    sortableSet: Set<string>,
  ) {
    const sortable = sortableSet.has(key);
    const isActive = sortCol === key;
    return (
      <th
        key={key}
        onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setDragOverCol(key); }}
        onDrop={(ev) => {
          ev.preventDefault();
          const fromKey = ev.dataTransfer.getData("text/plain");
          if (!fromKey || fromKey === key) { setDragOverCol(null); return; }
          const next = [...colOrder];
          const from = next.indexOf(fromKey);
          const to = next.indexOf(key);
          if (from === -1 || to === -1) return;
          next.splice(from, 1);
          next.splice(to, 0, fromKey);
          setOrder(next);
          localStorage.setItem(lsKey, JSON.stringify(next));
          setDragOverCol(null);
        }}
        onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDragOverCol(null); }}
        className={clsx(
          "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans select-none",
          dragOverCol === key && "border-l-2 border-gold bg-gold/5"
        )}
      >
        <span className="flex items-center gap-1">
          <span
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData("text/plain", key);
              ev.dataTransfer.effectAllowed = "move";
              const th = ev.currentTarget.closest("th");
              if (th) ev.dataTransfer.setDragImage(th, th.offsetWidth / 2, th.offsetHeight / 2);
              setDragCol(key);
            }}
            onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
            className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0 pr-0.5"
          >
            <GripVertical size={11} />
          </span>
          {sortable ? (
            <button type="button" onClick={() => handleSort(key)} className="flex items-center gap-1 hover:text-header transition-colors cursor-pointer">
              {INCOME_COL_LABELS[key]}
              {isActive
                ? sortDir === "asc" ? <ChevronUp size={12} className="text-gold flex-shrink-0" /> : <ChevronDown size={12} className="text-gold flex-shrink-0" />
                : <ChevronsUpDown size={12} className="text-gray-300 flex-shrink-0" />}
            </button>
          ) : (
            <span>{INCOME_COL_LABELS[key]}</span>
          )}
        </span>
      </th>
    );
  }

  function renderEntriesCell(key: string, entry: any) {
    const typeInfo = INCOME_TYPE_LABELS[entry.type] ?? { label: entry.type, badge: "gray" as const };
    const isDeposit = entry.type === "DEPOSIT";
    switch (key) {
      case "date":
        return <td key={key} className="px-4 py-3 text-sm font-sans text-gray-600">{formatDate(entry.date)}</td>;
      case "unit":
        return <td key={key} className="px-4 py-3 text-sm font-mono text-header">{entry.unit?.unitNumber}</td>;
      case "tenant":
        return (
          <td key={key} className="px-4 py-3 text-sm font-sans text-gray-500">
            {entry.tenant ? <span className="flex items-center gap-1 text-gray-600"><User size={11} className="text-gray-400" />{entry.tenant.name}</span> : "—"}
          </td>
        );
      case "type":
        return <td key={key} className="px-4 py-3"><Badge variant={typeInfo.badge}>{typeInfo.label}</Badge></td>;
      case "platform":
        return <td key={key} className="px-4 py-3 text-sm font-sans text-gray-500">{entry.platform ? PLATFORM_LABELS[entry.platform] : "—"}{entry.agentName ? ` · ${entry.agentName}` : ""}</td>;
      case "invoice":
        return (
          <td key={key} className="px-4 py-3">
            {entry.invoice ? (
              <span className="flex items-center gap-1 text-xs text-green-700 font-sans bg-green-50 px-1.5 py-0.5 rounded">
                <Receipt size={10} />{entry.invoice.invoiceNumber}
              </span>
            ) : "—"}
          </td>
        );
      case "gross":
        return (
          <td key={key} className="px-4 py-3 text-right">
            <CurrencyDisplay amount={entry.grossAmount} size="sm" colorize />
            {isDeposit && <p className="text-xs text-purple-500 font-sans">deposit</p>}
          </td>
        );
      case "commission":
        return <td key={key} className="px-4 py-3 text-right"><CurrencyDisplay amount={entry.agentCommission} size="sm" className={entry.agentCommission > 0 ? "text-expense" : "text-gray-400"} /></td>;
      case "net":
        return (
          <td key={key} className="px-4 py-3 text-right">
            {isDeposit ? <span className="text-xs text-gray-400 font-sans italic">excluded</span> : <CurrencyDisplay amount={entry.grossAmount - entry.agentCommission} size="sm" colorize />}
          </td>
        );
      default:
        return <td key={key} />;
    }
  }

  function renderCollCell(key: string, row: { tenant: any; totalPaid: number; expected: number; isPaid: boolean; paid: any[] }) {
    const { tenant, totalPaid, expected, isPaid, paid } = row;
    switch (key) {
      case "unit":
        return <td key={key} className="px-4 py-3 text-sm font-mono text-header font-medium">{tenant.unit?.unitNumber ?? "—"}</td>;
      case "tenant":
        return (
          <td key={key} className="px-4 py-3">
            <p className="text-sm font-sans text-gray-700 font-medium">{tenant.name}</p>
            {tenant.phone && <p className="text-xs text-gray-400 font-sans">{tenant.phone}</p>}
          </td>
        );
      case "property":
        return <td key={key} className="px-4 py-3 text-sm font-sans text-gray-500">{tenant.unit?.property?.name ?? "—"}</td>;
      case "expected":
        return (
          <td key={key} className="px-4 py-3">
            <CurrencyDisplay amount={expected} size="sm" className="text-gray-700" />
            {tenant.serviceCharge > 0 && <p className="text-xs text-gray-400 font-sans mt-0.5">+ {fmt(tenant.serviceCharge)} svc</p>}
          </td>
        );
      case "received":
        return (
          <td key={key} className="px-4 py-3">
            {totalPaid > 0 ? <CurrencyDisplay amount={totalPaid} size="sm" className="text-income" /> : <span className="text-xs text-gray-400 font-sans">—</span>}
          </td>
        );
      case "status":
        return (
          <td key={key} className="px-4 py-3">
            {isPaid ? (
              <span className="flex items-center gap-1.5 text-xs font-sans text-green-700 bg-green-50 px-2 py-1 rounded-lg w-fit"><CheckCircle2 size={12} /> Paid</span>
            ) : totalPaid > 0 ? (
              <span className="flex items-center gap-1.5 text-xs font-sans text-amber-700 bg-amber-50 px-2 py-1 rounded-lg w-fit"><AlertCircle size={12} /> Partial</span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-sans text-red-600 bg-red-50 px-2 py-1 rounded-lg w-fit"><AlertCircle size={12} /> Pending</span>
            )}
          </td>
        );
      default:
        return <td key={key} />;
    }
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
  function openFormWithDefaults(prefill?: Partial<IncomeEntryInput>, forMonth?: Date) {
    reset({ type: "LONGTERM_RENT", agentCommission: 0, ...prefill });
    setActiveTenant(null);
    setShowForm(true);
    setTab("entries");
    // If recording for a specific past month, update the month picker
    if (forMonth) setMonth(forMonth);
  }

  function handleQuickRecord(tenant: any, forMonth?: Date) {
    const targetMonth = forMonth ?? month;
    const dateStr = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}-01`;
    openFormWithDefaults(
      {
        type: "LONGTERM_RENT",
        unitId: tenant.unitId,
        tenantId: tenant.id,
        grossAmount: tenant.monthlyRent,
        date: dateStr,
      },
      forMonth,
    );
    setActiveTenant({ id: tenant.id, name: tenant.name });
  }

  // ── Record All Pending ────────────────────────────────────────────────────
  const [recordingAll, setRecordingAll] = useState(false);

  async function handleRecordAllPending() {
    const unpaid = collectionRows.filter((r) => !r.isPaid);
    if (unpaid.length === 0) return;
    if (!window.confirm(`Record full rent payment for ${unpaid.length} unpaid tenant${unpaid.length > 1 ? "s" : ""}?`)) return;

    setRecordingAll(true);
    const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
    let created = 0;
    let failed  = 0;

    for (const { tenant } of unpaid) {
      try {
        const res = await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type:           "LONGTERM_RENT",
            unitId:         tenant.unitId,
            tenantId:       tenant.id,
            grossAmount:    tenant.monthlyRent,
            agentCommission: 0,
            date:           dateStr,
          }),
        });
        if (res.ok) { created++; }
        else        { failed++; }
      } catch { failed++; }
    }

    // Refetch entries to update collection table
    fetchEntries();
    setArrearsSeq((s) => s + 1);
    setRecordingAll(false);

    if (created > 0 && failed === 0) {
      toast.success(`${created} payment${created > 1 ? "s" : ""} recorded`);
    } else if (created > 0) {
      toast.success(`${created} recorded, ${failed} failed`);
    } else {
      toast.error("All failed — check entries manually");
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function onSubmit(data: IncomeEntryInput) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      // Refresh arrears data after recording a payment
      setArrearsSeq((s) => s + 1);
      reset({ type: "LONGTERM_RENT", agentCommission: 0 });
      setActiveTenant(null);
      setShowForm(false);
      const linked = entry.invoice ? ` · Invoice ${entry.invoice.invoiceNumber} marked paid` : "";
      toast.success(`Income saved${linked}`);
    } catch {
      toast.error("Failed to save entry");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/income/${deleteId}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== deleteId));
      setArrearsSeq((s) => s + 1);
      toast.success("Entry deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  // ── Mark commission paid / unpaid ─────────────────────────────────────────
  const [markingCommission, setMarkingCommission] = useState<string | null>(null);

  async function handleMarkCommission(entryId: string, paid: boolean) {
    setMarkingCommission(entryId);
    try {
      const res = await fetch(`/api/income/${entryId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPaidAt: paid ? new Date().toISOString() : null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, commissionPaidAt: updated.commissionPaidAt } : e));
      toast.success(paid ? "Commission marked as paid" : "Commission marked as unpaid");
    } catch {
      toast.error("Failed to update commission status");
    } finally {
      setMarkingCommission(null);
    }
  }

  // ── Commission stats (derived from current month entries) ─────────────────
  const commissionEntries  = entries.filter((e: any) => e.agentCommission > 0);
  const totalCommission    = commissionEntries.reduce((s: number, e: any) => s + e.agentCommission, 0);
  const paidCommission     = commissionEntries.filter((e: any) => e.commissionPaidAt).reduce((s: number, e: any) => s + e.agentCommission, 0);
  const outstandingComm    = totalCommission - paidCommission;

  // Per-agent breakdown
  const agentBreakdown = commissionEntries.reduce((acc: Record<string, { count: number; total: number; paid: number }>, e: any) => {
    const name = e.agentName ?? "Unknown";
    if (!acc[name]) acc[name] = { count: 0, total: 0, paid: 0 };
    acc[name].count++;
    acc[name].total += e.agentCommission;
    if (e.commissionPaidAt) acc[name].paid += e.agentCommission;
    return acc;
  }, {});

  // ── Open arrears case from income page ────────────────────────────────────
  async function handleOpenCase(tenant: any, amountOwed: number) {
    const propertyId = tenant.unit?.property?.id ?? tenant.unit?.propertyId;
    if (!propertyId) { toast.error("Could not determine property"); return; }
    setOpeningCaseFor(tenant.id);
    const res = await fetch("/api/arrears", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant.id, propertyId, amountOwed }),
    });
    setOpeningCaseFor(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to open case");
      return;
    }
    const newCase = await res.json();
    setOpenCases((prev) => ({ ...prev, [tenant.id]: newCase.id }));
    toast.success(
      <span>
        Arrears case opened for {tenant.name}.{" "}
        <a href="/arrears" className="underline font-medium">View in Arrears →</a>
      </span>,
      { duration: 5000 }
    );
  }

  // ── P&L totals ─────────────────────────────────────────────────────────────
  const plEntries      = entries.filter((e: any) => !EXCLUDED_FROM_PL.includes(e.type));
  const depositEntries = entries.filter((e: any) => e.type === "DEPOSIT");
  const totalGross     = plEntries.reduce((s: number, e: any) => s + e.grossAmount, 0);
  const totalComm      = plEntries.reduce((s: number, e: any) => s + e.agentCommission, 0);
  const totalDeposits  = depositEntries.reduce((s: number, e: any) => s + e.grossAmount, 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <Header title="Income" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />

      <div className="page-container space-y-5">

        {/* ── Month selector ─────────────────────────────────────────────── */}
        {collectionMode !== "arrears" && (
          <div className="flex items-center gap-3">
            <MonthPicker value={month} onChange={setMonth} max={new Date()} />
            {!(month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()) && (
              <button
                onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                className="text-xs text-gold hover:text-gold-dark font-sans font-medium underline underline-offset-2 transition-colors"
              >
                Back to {MONTH_SHORT[new Date().getMonth()]}
              </button>
            )}
          </div>
        )}

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        {(() => {
          const expected    = collectionSummary.totalExpected;
          const outstanding = Math.max(0, expected - totalGross);
          const fullyCollected = expected > 0 && outstanding === 0;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Collected */}
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Collected</p>
                <CurrencyDisplay amount={totalGross} className="block mt-1 text-income" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-0.5">
                  {MONTH_SHORT[month.getMonth()]} {month.getFullYear()} · excl. deposits
                </p>
              </Card>

              {/* Expected */}
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Expected</p>
                <CurrencyDisplay amount={expected} className="block mt-1 text-header" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-0.5">
                  {collectionSummary.total} active {collectionSummary.total === 1 ? "tenant" : "tenants"}
                </p>
              </Card>

              {/* Outstanding */}
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Outstanding</p>
                {fullyCollected ? (
                  <>
                    <p className="block mt-1 text-income text-lg font-display font-semibold">All clear ✓</p>
                    <p className="text-xs text-gray-400 font-sans mt-0.5">fully collected</p>
                  </>
                ) : (
                  <>
                    <CurrencyDisplay
                      amount={outstanding}
                      className={`block mt-1 ${outstanding > 0 ? "text-expense" : "text-income"}`}
                      size="lg"
                    />
                    <p className="text-xs text-gray-400 font-sans mt-0.5">
                      {expected > 0
                        ? `${Math.round((totalGross / expected) * 100)}% collected`
                        : "no active tenants"}
                    </p>
                  </>
                )}
              </Card>

              {/* Net Income */}
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Net Income</p>
                <CurrencyDisplay
                  amount={totalGross - totalComm}
                  className={`block mt-1 ${totalGross - totalComm >= 0 ? "text-income" : "text-expense"}`}
                  size="lg"
                />
                <p className="text-xs text-gray-400 font-sans mt-0.5">
                  {totalComm > 0 ? `after ${fmt(totalComm)} commission` : "no commissions"}
                </p>
              </Card>
            </div>
          );
        })()}

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 bg-cream-dark rounded-xl p-1 w-fit">
          <button
            onClick={() => { setTab("collection"); setSortCol(null); setSortDir("asc"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all ${
              tab === "collection" ? "bg-white text-header shadow-sm" : "text-gray-500 hover:text-header"
            }`}
          >
            <TableProperties size={15} />
            Rent Collection
            {!tenantsLoading && !loading && collectionMode === "monthly" && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                collectionSummary.paid === collectionSummary.total
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {collectionSummary.paid}/{collectionSummary.total}
              </span>
            )}
            {!tenantsLoading && collectionMode === "arrears" && arrearsSummary.tenantsWithArrears > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                {arrearsSummary.tenantsWithArrears} in arrears
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("entries"); setSortCol(null); setSortDir("asc"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all ${
              tab === "entries" ? "bg-white text-header shadow-sm" : "text-gray-500 hover:text-header"
            }`}
          >
            <LayoutList size={15} />
            All Entries
            <span className="text-xs text-gray-400">({entries.length})</span>
          </button>
          <button
            onClick={() => { setTab("commissions"); setSortCol(null); setSortDir("asc"); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans font-medium transition-all ${
              tab === "commissions" ? "bg-white text-header shadow-sm" : "text-gray-500 hover:text-header"
            }`}
          >
            <DollarSign size={15} />
            Commissions
            {outstandingComm > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                {commissionEntries.filter((e: any) => !e.commissionPaidAt).length} unpaid
              </span>
            )}
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            COLLECTION TAB
        ════════════════════════════════════════════════════════════════ */}
        {tab === "collection" && (
          <div className="space-y-4">

            {/* Monthly / Arrears toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setCollectionMode("monthly")}
                  className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-all ${
                    collectionMode === "monthly"
                      ? "bg-white text-header shadow-sm"
                      : "text-gray-500 hover:text-header"
                  }`}
                >
                  This Month
                </button>
                <button
                  onClick={() => { setCollectionMode("arrears"); setArrearsSeq((s) => s + 1); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-all ${
                    collectionMode === "arrears"
                      ? "bg-white text-header shadow-sm"
                      : "text-gray-500 hover:text-header"
                  }`}
                >
                  Arrears
                </button>
              </div>
              {collectionMode === "arrears" && (
                <button
                  onClick={() => setArrearsSeq((s) => s + 1)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-header font-sans transition-colors"
                >
                  <RefreshCw size={12} className={arrearsLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              )}
            </div>

            {/* ── MONTHLY MODE ──────────────────────────────────────────── */}
            {collectionMode === "monthly" && (
              <>
                {/* Progress summary */}
                <Card padding="sm">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-display text-header">
                        {collectionSummary.paid} of {collectionSummary.total} units collected
                      </p>
                      <p className="text-xs text-gray-400 font-sans mt-0.5">
                        {MONTH_NAMES[month.getMonth()]} {month.getFullYear()} — long-term tenants
                      </p>
                    </div>
                    <div className="text-right">
                      <CurrencyDisplay amount={collectionSummary.totalReceived} size="md" className="text-income font-medium" />
                      <p className="text-xs text-gray-400 font-sans">
                        of <span className="font-medium text-gray-500">{fmt(collectionSummary.totalExpected)}</span> expected
                      </p>
                    </div>
                  </div>
                  {collectionSummary.total > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-income h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (collectionSummary.totalReceived / collectionSummary.totalExpected) * 100)}%` }}
                      />
                    </div>
                  )}
                  {/* Record all pending */}
                  {collectionSummary.paid < collectionSummary.total && !tenantsLoading && !loading && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <p className="text-xs text-gray-400 font-sans">
                        {collectionSummary.total - collectionSummary.paid} tenant{collectionSummary.total - collectionSummary.paid > 1 ? "s" : ""} still pending
                      </p>
                      <button
                        onClick={handleRecordAllPending}
                        disabled={recordingAll}
                        className="flex items-center gap-1.5 text-xs font-medium font-sans text-gold hover:text-gold-dark transition-colors disabled:opacity-50"
                      >
                        {recordingAll
                          ? <><Loader2 size={12} className="animate-spin" /> Recording…</>
                          : <><Zap size={12} /> Record all pending</>
                        }
                      </button>
                    </div>
                  )}
                </Card>

                {/* Monthly table */}
                {tenantsLoading || loading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : collectionRows.length === 0 ? (
                  <EmptyState title="No active tenants" description="Add tenants to track rent collection" icon={<User size={40} />} />
                ) : (
                  <Card padding="none">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[580px]">
                        <thead className="bg-cream-dark">
                          <tr>
                            {collColOrder.map((key) => renderColHeader(key, collColOrder, setCollColOrder, "income-coll-col-order", COLL_SORTABLE))}
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedCollectionRows.map((row) => (
                            <tr key={row.tenant.id} className="border-t border-gray-50 hover:bg-cream/50 transition-colors">
                              {collColOrder.map((key) => renderCollCell(key, row))}
                              <td className="px-4 py-3">
                                {row.isPaid ? (
                                  <button onClick={() => setTab("entries")} className="text-xs text-gray-400 hover:text-header font-sans underline underline-offset-2 transition-colors">
                                    {row.paid.length} {row.paid.length === 1 ? "entry" : "entries"}
                                  </button>
                                ) : (
                                  <Button size="sm" variant="gold" onClick={() => handleQuickRecord(row.tenant)}>
                                    <Plus size={12} /> Record
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}

            {/* ── ARREARS MODE ──────────────────────────────────────────── */}
            {collectionMode === "arrears" && (
              <>
                {/* Arrears summary banner */}
                {!arrearsLoading && arrearsSummary.totalOutstanding > 0 && (
                  <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                    <AlertTriangle size={20} className="text-red-500 shrink-0" />
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-red-500 font-sans uppercase tracking-wide">Total Outstanding</p>
                        <CurrencyDisplay amount={arrearsSummary.totalOutstanding} size="lg" className="text-red-700 font-bold" />
                      </div>
                      <div>
                        <p className="text-xs text-red-500 font-sans uppercase tracking-wide">Tenants in Arrears</p>
                        <p className="text-lg font-display text-red-700 font-bold">{arrearsSummary.tenantsWithArrears}</p>
                      </div>
                      <div>
                        <p className="text-xs text-red-500 font-sans uppercase tracking-wide">Months Overdue</p>
                        <p className="text-lg font-display text-red-700 font-bold">{arrearsSummary.totalMonthsOwed}</p>
                      </div>
                    </div>
                  </div>
                )}

                {!arrearsLoading && arrearsSummary.totalOutstanding === 0 && !tenantsLoading && allTenants.length > 0 && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                    <CheckCircle2 size={20} className="text-green-500" />
                    <p className="text-sm font-sans text-green-700 font-medium">All tenants are up to date — no arrears outstanding.</p>
                  </div>
                )}

                {/* Arrears table */}
                {arrearsLoading || tenantsLoading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : allTenants.length === 0 ? (
                  <EmptyState title="No active tenants" description="Add tenants to track arrears" icon={<User size={40} />} />
                ) : (
                  <Card padding="none">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px]">
                        <thead className="bg-cream-dark">
                          <tr>
                            <th className="w-8 px-4 py-3" />
                            {["Unit","Tenant","Months Unpaid","Total Arrears","Last Payment",""].map((h) => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {arrearsRows.map(({ tenant, summary }) => {
                            const isExpanded = expandedRows.has(tenant.id);
                            const severity = summary.totalArrears > tenant.monthlyRent * 2
                              ? "bg-red-50 border-l-4 border-red-300"
                              : summary.totalArrears > 0
                              ? "bg-amber-50/50 border-l-4 border-amber-300"
                              : "";
                            return (
                              <>
                                {/* Main row */}
                                <tr
                                  key={tenant.id}
                                  className={`border-t border-gray-50 hover:bg-cream/50 transition-colors cursor-pointer ${severity}`}
                                  onClick={() => toggleRow(tenant.id)}
                                >
                                  <td className="px-4 py-3 text-gray-400">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-mono text-header font-medium">{tenant.unit?.unitNumber ?? "—"}</td>
                                  <td className="px-4 py-3">
                                    <p className="text-sm font-sans text-gray-700 font-medium">{tenant.name}</p>
                                    <p className="text-xs text-gray-400 font-sans">{tenant.unit?.property?.name ?? "—"}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    {summary.totalMonthsOwed === 0 ? (
                                      <span className="text-xs text-green-700 font-sans">Up to date</span>
                                    ) : (
                                      <span className="text-sm font-sans font-semibold text-red-600">
                                        {summary.totalMonthsOwed} {summary.totalMonthsOwed === 1 ? "month" : "months"}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    {summary.totalArrears > 0 ? (
                                      <CurrencyDisplay amount={summary.totalArrears} size="sm" className="text-red-600 font-semibold" />
                                    ) : (
                                      <span className="text-xs text-green-600 font-sans">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-sans text-gray-500">
                                    {summary.lastPaymentDate
                                      ? formatDate(summary.lastPaymentDate)
                                      : <span className="text-xs text-gray-400 italic">Never</span>}
                                  </td>
                                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2">
                                      {summary.hasArrears && (
                                        <Button
                                          size="sm"
                                          variant="gold"
                                          onClick={() => handleQuickRecord(tenant)}
                                        >
                                          <Plus size={12} /> Record
                                        </Button>
                                      )}
                                      {summary.hasArrears && (
                                        openCases[tenant.id] ? (
                                          <Link
                                            href="/arrears"
                                            className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
                                          >
                                            <FolderOpen size={11} />
                                            Case Open
                                          </Link>
                                        ) : (
                                          <button
                                            disabled={openingCaseFor === tenant.id}
                                            onClick={() => handleOpenCase(tenant, summary.totalArrears)}
                                            className="flex items-center gap-1 text-xs font-medium text-gray-500 border border-gray-200 px-2 py-1.5 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-colors whitespace-nowrap disabled:opacity-50"
                                          >
                                            {openingCaseFor === tenant.id
                                              ? <Loader2 size={11} className="animate-spin" />
                                              : <FolderOpen size={11} />}
                                            Open Case
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {/* Expanded: per-month breakdown */}
                                {isExpanded && (
                                  <tr key={`${tenant.id}-expanded`} className="border-t border-gray-50">
                                    <td colSpan={7} className="px-0 py-0">
                                      <div className="bg-gray-50 border-t border-gray-100 px-8 py-3">
                                        <table className="w-full text-xs font-sans">
                                          <thead>
                                            <tr className="text-gray-400 uppercase tracking-wide">
                                              <th className="pb-2 text-left font-medium">Month</th>
                                              <th className="pb-2 text-right font-medium">Expected</th>
                                              <th className="pb-2 text-right font-medium">Paid</th>
                                              <th className="pb-2 text-right font-medium">Balance</th>
                                              <th className="pb-2 text-center font-medium">Status</th>
                                              <th className="pb-2" />
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {[...summary.months].reverse().map((m) => (
                                              <tr key={`${m.year}-${m.month}`} className={`border-t border-gray-100 ${!m.isPaid ? "text-gray-700" : "text-gray-400"}`}>
                                                <td className="py-1.5 font-medium">
                                                  {MONTH_SHORT[m.month]} {m.year}
                                                </td>
                                                <td className="py-1.5 text-right">{fmt(m.expected)}</td>
                                                <td className="py-1.5 text-right">{m.totalPaid > 0 ? fmt(m.totalPaid) : "—"}</td>
                                                <td className={`py-1.5 text-right font-semibold ${m.balance < 0 ? "text-red-500" : "text-green-600"}`}>
                                                  {m.balance >= 0 ? "+" : ""}{fmt(m.balance)}
                                                </td>
                                                <td className="py-1.5 text-center">
                                                  {m.isPaid ? (
                                                    <span className="text-green-600">✓ Paid</span>
                                                  ) : m.isPartial ? (
                                                    <span className="text-amber-600">⏱ Partial</span>
                                                  ) : (
                                                    <span className="text-red-500">⚠ Unpaid</span>
                                                  )}
                                                </td>
                                                <td className="py-1.5 text-right">
                                                  {!m.isPaid && (
                                                    <button
                                                      className="text-gold hover:text-gold-dark font-medium underline underline-offset-2 transition-colors"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleQuickRecord(tenant, new Date(m.year, m.month, 1));
                                                      }}
                                                    >
                                                      Record
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            ENTRIES TAB
        ════════════════════════════════════════════════════════════════ */}
        {tab === "entries" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-header">Entries</h2>
              <div className="flex items-center gap-2">
                {entries.length > 0 && (
                  <button
                    onClick={() => exportIncome(entries, month)}
                    title="Export to Excel"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium text-gray-500 border border-gray-200 rounded-lg hover:border-green-300 hover:text-green-700 hover:bg-green-50 transition-colors"
                  >
                    <FileDown size={13} /> Export
                  </button>
                )}
                <Button
                  onClick={() => { reset({ type: "LONGTERM_RENT", agentCommission: 0 }); setActiveTenant(null); setShowForm(!showForm); }}
                  size="sm" variant="gold"
                >
                  <Plus size={15} /> Add Entry
                </Button>
              </div>
            </div>

            {/* Form */}
            {showForm && (
              <Card>
                <h3 className="font-display text-base text-header mb-4">New Income Entry</h3>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <input type="hidden" {...register("tenantId")} />
                  <input type="hidden" {...register("invoiceId")} />

                  <div className="grid grid-cols-2 gap-4">
                    <Select label="Type" {...register("type")} options={[
                      { value: "LONGTERM_RENT",    label: "Long-term Rent" },
                      { value: "SERVICE_CHARGE",   label: "Service Charge" },
                      { value: "DEPOSIT",          label: "Deposit (not P&L income)" },
                      { value: "AIRBNB",           label: "Airbnb / Short-let" },
                      { value: "UTILITY_RECOVERY", label: "Utility Recovery" },
                      { value: "OTHER",            label: "Other" },
                    ]} error={errors.type?.message} />
                    <Input label="Date" type="date" {...register("date")} error={errors.date?.message} />
                  </div>

                  {incomeType === "AIRBNB" && (
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Check-in" type="date" {...register("checkIn")} />
                      <Input label="Check-out" type="date" {...register("checkOut")} />
                    </div>
                  )}

                  {incomeType === "DEPOSIT" && (
                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-xs text-purple-700 font-sans">
                      Deposits are held on behalf of the tenant and are <strong>not counted as P&L income</strong>. They appear separately in the summary.
                    </div>
                  )}

                  <div>
                    <Select
                      label="Unit"
                      placeholder="Select unit..."
                      {...register("unitId")}
                      options={allUnits.map((u: any) => ({ value: u.id, label: `${u.unitNumber} (${u.propertyName})` }))}
                      error={errors.unitId?.message}
                    />
                    {["LONGTERM_RENT", "SERVICE_CHARGE", "DEPOSIT"].includes(incomeType) && selectedUnitId && (
                      <div className="mt-1.5 flex items-center gap-2">
                        {tenantLookupLoading ? (
                          <span className="text-xs text-gray-400 font-sans">Looking up tenant…</span>
                        ) : activeTenant ? (
                          <span className="flex items-center gap-1.5 text-xs font-sans text-income bg-green-50 px-2 py-1 rounded-lg">
                            <User size={11} />
                            Linked to: <span className="font-medium">{activeTenant.name}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-sans italic">No active tenant found for this unit</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Gross Amount (KSh)" type="number" step="0.01" prefix="KSh" {...register("grossAmount")} error={errors.grossAmount?.message} />
                    <Input label="Commission (KSh)" type="number" step="0.01" prefix="KSh" {...register("agentCommission")} />
                  </div>

                  {incomeType === "AIRBNB" && (
                    <div className="grid grid-cols-2 gap-4">
                      <Select label="Platform" placeholder="Select..." {...register("platform")} options={[
                        { value: "AIRBNB",      label: "Airbnb" },
                        { value: "BOOKING_COM", label: "Booking.com" },
                        { value: "DIRECT",      label: "Direct" },
                        { value: "AGENT",       label: "Agent" },
                      ]} />
                      {platform === "AGENT" && (
                        <Select label="Agent" placeholder="Select..." {...register("agentName")} options={AGENTS.map((a) => ({ value: a, label: a }))} />
                      )}
                    </div>
                  )}

                  <Input label="Note" {...register("note")} placeholder="Optional note..." />
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" loading={submitting}>Save Entry</Button>
                    <Button type="button" variant="secondary" onClick={() => { reset({ type: "LONGTERM_RENT", agentCommission: 0 }); setActiveTenant(null); setShowForm(false); }}>Cancel</Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Entries table */}
            <Card padding="none">
              {loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : entries.length === 0 ? (
                <EmptyState
                  title="No entries"
                  description="No income logged for this month"
                  icon={<TrendingUp size={40} />}
                  action={<Button variant="gold" size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> Add Entry</Button>}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead className="bg-cream-dark">
                      <tr>
                        {entriesColOrder.map((key) => renderColHeader(key, entriesColOrder, setEntriesColOrder, "income-entries-col-order", ENTRIES_SORTABLE))}
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEntries.map((entry: any) => (
                        <tr key={entry.id} className={clsx("border-t border-gray-50 hover:bg-cream/50 transition-colors", entry.type === "DEPOSIT" && "opacity-75")}>
                          {entriesColOrder.map((key) => renderEntriesCell(key, entry))}
                          <td className="px-4 py-3">
                            <button onClick={() => setDeleteId(entry.id)} className="text-gray-300 hover:text-expense transition-colors p-1">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            COMMISSIONS TAB
        ════════════════════════════════════════════════════════════════ */}
        {tab === "commissions" && (
          <div className="space-y-4">

            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Total Commission</p>
                <CurrencyDisplay amount={totalCommission} className="block mt-1 text-header" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-0.5">{commissionEntries.length} entr{commissionEntries.length === 1 ? "y" : "ies"}</p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Paid to Agent</p>
                <CurrencyDisplay amount={paidCommission} className="block mt-1 text-income" size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-0.5">{commissionEntries.filter((e: any) => e.commissionPaidAt).length} settled</p>
              </Card>
              <Card padding="sm">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">Outstanding</p>
                <CurrencyDisplay amount={outstandingComm} className={`block mt-1 ${outstandingComm > 0 ? "text-expense" : "text-income"}`} size="lg" />
                <p className="text-xs text-gray-400 font-sans mt-0.5">{commissionEntries.filter((e: any) => !e.commissionPaidAt).length} unpaid</p>
              </Card>
            </div>

            {commissionEntries.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center py-10 gap-2 text-gray-400">
                  <DollarSign size={28} className="opacity-30" />
                  <p className="text-sm font-sans">No commission entries for {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</p>
                  <p className="text-xs font-sans">Commissions are recorded on Airbnb / agent income entries</p>
                </div>
              </Card>
            ) : (
              <>
                {/* Per-agent breakdown */}
                {Object.keys(agentBreakdown).length > 0 && (
                  <Card>
                    <h3 className="section-header mb-4">Per-Agent Summary</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[500px]">
                        <thead className="bg-cream-dark">
                          <tr>
                            {["Agent", "Bookings", "Total Commission", "Paid", "Outstanding", "Status"].map((h) => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(agentBreakdown).sort(([, a], [, b]) => b.total - a.total).map(([agent, stats]) => {
                            const outstanding = stats.total - stats.paid;
                            const allPaid = outstanding === 0;
                            return (
                              <tr key={agent} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium font-sans text-header">{agent}</td>
                                <td className="px-4 py-3 text-sm font-sans text-gray-500 text-center">{stats.count}</td>
                                <td className="px-4 py-3 text-right"><CurrencyDisplay amount={stats.total} size="sm" className="text-header" /></td>
                                <td className="px-4 py-3 text-right"><CurrencyDisplay amount={stats.paid} size="sm" className="text-income" /></td>
                                <td className="px-4 py-3 text-right">
                                  <CurrencyDisplay amount={outstanding} size="sm" className={outstanding > 0 ? "text-expense" : "text-income"} />
                                </td>
                                <td className="px-4 py-3">
                                  {allPaid
                                    ? <span className="flex items-center gap-1 text-xs text-income font-sans"><CheckCheck size={12} /> All paid</span>
                                    : <span className="flex items-center gap-1 text-xs text-amber-600 font-sans"><Clock size={12} /> Outstanding</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {/* Entry-level breakdown */}
                <Card>
                  <h3 className="section-header mb-4">Commission Entries — {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-cream-dark">
                        <tr>
                          {["Date", "Unit", "Agent", "Gross Income", "Commission", "Status", "Action"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide font-sans">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {commissionEntries.map((entry: any) => {
                          const isPaid = !!entry.commissionPaidAt;
                          const isMarking = markingCommission === entry.id;
                          return (
                            <tr key={entry.id} className="border-t border-gray-50 hover:bg-cream/40 transition-colors">
                              <td className="px-4 py-3 text-sm font-sans text-gray-600">{formatDate(entry.date)}</td>
                              <td className="px-4 py-3 text-xs font-mono text-gray-500">
                                {entry.unit?.unitNumber}
                                <span className="block text-gray-400">{entry.unit?.property?.name}</span>
                              </td>
                              <td className="px-4 py-3 text-sm font-sans text-header">{entry.agentName ?? "—"}</td>
                              <td className="px-4 py-3 text-right"><CurrencyDisplay amount={entry.grossAmount} size="sm" className="text-gray-600" /></td>
                              <td className="px-4 py-3 text-right"><CurrencyDisplay amount={entry.agentCommission} size="sm" className="text-expense" /></td>
                              <td className="px-4 py-3">
                                {isPaid ? (
                                  <span className="flex items-center gap-1 text-xs text-income font-sans">
                                    <CheckCheck size={12} />
                                    {entry.commissionPaidAt ? `Paid ${formatDate(entry.commissionPaidAt)}` : "Paid"}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-amber-600 font-sans">
                                    <Clock size={12} /> Unpaid
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  disabled={isMarking}
                                  onClick={() => handleMarkCommission(entry.id, !isPaid)}
                                  className={`text-xs px-2.5 py-1 rounded-lg font-sans font-medium transition-colors disabled:opacity-40 ${
                                    isPaid
                                      ? "border border-gray-200 text-gray-500 hover:bg-gray-50"
                                      : "bg-income/10 text-income hover:bg-income/20"
                                  }`}
                                >
                                  {isMarking ? <Loader2 size={12} className="animate-spin inline" /> : isPaid ? "Mark Unpaid" : "Mark Paid"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete entry?"
        message="This income entry will be permanently deleted."
        loading={deleting}
      />
    </div>
  );
}
