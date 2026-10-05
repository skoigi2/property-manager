"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { Plus, Trash2, FileText, Save, Loader2, Pencil, Lock, Download, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { TutorialVideo } from "@/components/ui/TutorialVideo";
import {
  finalUtilitiesCharge,
  meterTakesFinalReading,
  type FinalMeter,
  type UnbilledReading,
} from "@/lib/final-utilities";

type FinalUtilitiesData = {
  periodYear: number;
  periodMonth: number;
  meters: FinalMeter[];
  unbilled: UnbilledReading[];
};

const fmtMeter = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 3 });
const monthName = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

type DepositPosition = {
  contractual: number;
  received: number | null;
  held: number;
  shortfall: number;
  excess: number;
  verification: "VERIFIED" | "UNVERIFIED";
};

type CheckoutPrefill = {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    depositAmount: number;
    monthlyRent: number;
    leaseStart: string;
    leaseEnd: string | null;
    isActive: boolean;
  };
  unit: { id: string; unitNumber: string; type: string };
  property: { id: string; name: string; currency: string; organizationId: string | null };
  organization: { id: string; name: string } | null;
  outstandingBalance: number;
  deposit: DepositPosition;
  /** Null once the checkout is finalised (the stored amount is shown instead). */
  finalUtilities: FinalUtilitiesData | null;
  /** The tenant's latest handed-in move-out inspection, and what it fills in. */
  moveOutInspection: {
    id: string;
    status: "SUBMITTED" | "ACCEPTED";
    submittedAt: string | null;
    submittedByName: string | null;
    tenantDisagrees: boolean;
    tenantComments: string | null;
    prefill: {
      damageFound: boolean;
      damageNotes: string;
      damagedCount: number;
      keysReturned: KeysReturned;
      otherKeys: string[];
      finalMeterReadings: { meterId: string; reading: number }[];
    };
  } | null;
  checkout: ExistingCheckout | null;
};

type ExistingCheckout = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "DISPUTED";
  checkOutDate: string;
  damageFound: boolean;
  inventoryDamageAmount: number;
  inventoryDamageNotes: string | null;
  damageKeptByLandlord: boolean;
  rentBalanceOwing: number;
  rentBalanceSource: string | null;
  originalDeposit: number;
  depositReceived: number | null;
  totalDeductions: number;
  balanceToRefund: number;
  keysReturned: KeysReturned | null;
  utilityTransfers: UtilityTransfers | null;
  refundMethod: RefundMethod | null;
  refundDetails: RefundDetails | null;
  notes: string | null;
  deductions: { id: string; description: string; amount: number; category: DeductionCategory }[];
  signatureRequestedAt: string | null;
  tenantSignedName: string | null;
  tenantSignedAt: string | null;
  finalMeterReadings: { meterId: string; reading: number }[] | null;
  finalUtilitiesAmount: number;
  finalUtilitiesInvoiceId: string | null;
  conditionReportId?: string | null;
};

type DeductionCategory = "UTILITY" | "SERVICE_CHARGE" | "RENT_BALANCE" | "DAMAGE" | "OTHER";
type RefundMethod = "CHEQUE" | "CASH" | "MOBILE_TRANSFER" | "BANK_TRANSFER";

type KeysReturned = { mainDoor?: number; bedroom?: number; gate?: number; mailbox?: number };
type UtilityTransfers = {
  electricity?: { done?: boolean; date?: string | null };
  water?: { done?: boolean; date?: string | null };
  internet?: { done?: boolean; date?: string | null };
};
type RefundDetails = {
  payableTo?: string;
  recipientName?: string;
  mobileNumber?: string;
  accountNumber?: string;
  bankName?: string;
  accountName?: string;
};

interface DeductionRow {
  description: string;
  amount: string;
  category: DeductionCategory;
}

const METERED_QUICK_ADD = new Set(["Electricity Bill", "Water Bill"]);
const QUICK_ADD: { label: string; category: DeductionCategory }[] = [
  { label: "Electricity Bill", category: "UTILITY" },
  { label: "Water Bill",       category: "UTILITY" },
  { label: "Gas",              category: "UTILITY" },
  { label: "Garbage Collection", category: "UTILITY" },
  { label: "Service Charge",   category: "SERVICE_CHARGE" },
];

const REFUND_OPTIONS = [
  { value: "",                 label: "— Select method —" },
  { value: "CHEQUE",           label: "Cheque" },
  { value: "CASH",             label: "Cash" },
  { value: "MOBILE_TRANSFER",  label: "Mobile Transfer (M-Pesa/Airtel)" },
  { value: "BANK_TRANSFER",    label: "Bank Transfer" },
];

export function CheckoutForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CheckoutPrefill | null>(null);

  const [checkOutDate, setCheckOutDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [damageFound, setDamageFound] = useState(false);
  const [inventoryDamageAmount, setInventoryDamageAmount] = useState("");
  const [inventoryDamageNotes, setInventoryDamageNotes] = useState("");
  const [damageKeptByLandlord, setDamageKeptByLandlord] = useState(true);

  const [rentBalanceOwing, setRentBalanceOwing] = useState("0");
  const [rentBalanceOverride, setRentBalanceOverride] = useState(false);

  const [deductions, setDeductions] = useState<DeductionRow[]>([]);

  const [keys, setKeys] = useState<KeysReturned>({ mainDoor: 0, bedroom: 0, gate: 0, mailbox: 0 });

  const [utilities, setUtilities] = useState<UtilityTransfers>({
    electricity: { done: false, date: "" },
    water:       { done: false, date: "" },
    internet:    { done: false, date: "" },
  });

  const [refundMethod, setRefundMethod] = useState<RefundMethod | "">("");
  const [refundDetails, setRefundDetails] = useState<RefundDetails>({});
  const [notes, setNotes] = useState("");
  const [conditionReportId, setConditionReportId] = useState<string | null>(null);
  // Final meter readings typed per meter (move-out), and the meter list for
  // the check-out month — reloaded when the date moves to another month.
  const [finalReadings, setFinalReadings] = useState<Record<string, string>>({});
  const [finalUtilities, setFinalUtilities] = useState<FinalUtilitiesData | null>(null);

  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [requestingSign, setRequestingSign] = useState(false);

  async function requestSignature() {
    if (!data?.checkout) return;
    setRequestingSign(true);
    try {
      const res = await fetch(`/api/checkouts/${data.checkout.id}/signature-request`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create sign-off link");
      try { await navigator.clipboard.writeText(json.url); } catch {}
      toast.success(
        json.emailed
          ? "Sign-off link emailed to the tenant (and copied to your clipboard)"
          : "Sign-off link copied — share it with the tenant (no email on file)",
        { duration: 6000 },
      );
      setData((prev) =>
        prev?.checkout
          ? { ...prev, checkout: { ...prev.checkout, signatureRequestedAt: new Date().toISOString() } }
          : prev,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create sign-off link");
    } finally {
      setRequestingSign(false);
    }
  }

  const isCompleted = data?.checkout?.status === "COMPLETED";
  const currency = data?.property.currency ?? "USD";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}/checkout`);
        if (!res.ok) {
          toast.error("Failed to load tenant");
          return;
        }
        const json: CheckoutPrefill = await res.json();
        if (!mounted) return;
        setData(json);
        setFinalUtilities(json.finalUtilities);
        const typed: Record<string, string> = {};
        for (const m of json.finalUtilities?.meters ?? []) {
          if (m.periodReading?.editable) typed[m.meterId] = String(m.periodReading.currentReading);
        }
        for (const r of json.checkout?.finalMeterReadings ?? []) typed[r.meterId] = String(r.reading);
        setFinalReadings(typed);

        // Prefill from existing checkout if present
        if (json.checkout) {
          const c = json.checkout;
          setCheckOutDate(format(new Date(c.checkOutDate), "yyyy-MM-dd"));
          setDamageFound(c.damageFound);
          setInventoryDamageAmount(c.inventoryDamageAmount > 0 ? String(c.inventoryDamageAmount) : "");
          setInventoryDamageNotes(c.inventoryDamageNotes ?? "");
          setDamageKeptByLandlord(c.damageKeptByLandlord);
          setRentBalanceOwing(String(c.rentBalanceOwing));
          setRentBalanceOverride(c.rentBalanceSource === "override");
          setDeductions(
            c.deductions.map((d) => ({
              description: d.description,
              amount: String(d.amount),
              category: d.category,
            }))
          );
          if (c.keysReturned) setKeys(c.keysReturned);
          if (c.utilityTransfers) {
            setUtilities({
              electricity: c.utilityTransfers.electricity ?? { done: false, date: "" },
              water:       c.utilityTransfers.water       ?? { done: false, date: "" },
              internet:    c.utilityTransfers.internet    ?? { done: false, date: "" },
            });
          }
          setRefundMethod(c.refundMethod ?? "");
          setRefundDetails(c.refundDetails ?? {});
          setNotes(c.notes ?? "");
          setConditionReportId(c.conditionReportId ?? null);
        } else {
          setRentBalanceOwing(String(json.outstandingBalance.toFixed(2)));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  const checkoutPeriod = checkOutDate.slice(0, 7);
  useEffect(() => {
    if (!finalUtilities || data?.checkout?.status === "COMPLETED") return;
    const loaded = `${finalUtilities.periodYear}-${String(finalUtilities.periodMonth).padStart(2, "0")}`;
    if (!checkoutPeriod || loaded === checkoutPeriod) return;
    let cancelled = false;
    fetch(`/api/tenants/${tenantId}/checkout?checkOutDate=${checkOutDate}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: CheckoutPrefill | null) => {
        if (!cancelled && json?.finalUtilities) setFinalUtilities(json.finalUtilities);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutPeriod]);

  const finalInputs = useMemo(
    () =>
      Object.entries(finalReadings)
        .filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v)))
        .map(([meterId, v]) => ({ meterId, reading: Number(v) })),
    [finalReadings],
  );
  const finalCharge = useMemo(
    () => (finalUtilities ? finalUtilitiesCharge(finalUtilities.meters, finalInputs, finalUtilities.unbilled) : null),
    [finalUtilities, finalInputs],
  );
  const hasMeters = !!finalUtilities && (finalUtilities.meters.length > 0 || finalUtilities.unbilled.length > 0);

  const totalDeductions = useMemo(
    () => deductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0),
    [deductions]
  );

  const inventoryDamage = damageFound ? parseFloat(inventoryDamageAmount) || 0 : 0;
  const rentBal = parseFloat(rentBalanceOwing) || 0;
  // Settlement base = deposit actually received (receipt trail), falling back
  // to the contractual amount only when no receipts exist — mirrors the server.
  const depositPosition = data?.deposit ?? null;
  const deposit = depositPosition?.held ?? data?.tenant.depositAmount ?? 0;
  const depositUnverified = depositPosition?.verification === "UNVERIFIED";
  const depositShortfall = depositPosition?.shortfall ?? 0;
  const finalUtilitiesTotal = data?.checkout?.status === "COMPLETED"
    ? data.checkout.finalUtilitiesAmount
    : finalCharge?.total ?? 0;
  const balanceToRefund = deposit - inventoryDamage - rentBal - totalDeductions - finalUtilitiesTotal;
  const isOwed = balanceToRefund < 0;

  function addDeduction(label = "", category: DeductionCategory = "OTHER") {
    setDeductions((p) => [...p, { description: label, amount: "", category }]);
  }
  function removeDeduction(i: number) {
    setDeductions((p) => p.filter((_, idx) => idx !== i));
  }
  function updateDeduction(i: number, field: keyof DeductionRow, value: string) {
    setDeductions((p) => p.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  }

  function buildPayload() {
    return {
      checkOutDate,
      damageFound,
      inventoryDamageAmount: damageFound ? parseFloat(inventoryDamageAmount) || 0 : 0,
      inventoryDamageNotes: damageFound ? inventoryDamageNotes : "",
      damageKeptByLandlord,
      rentBalanceOwing: rentBal,
      rentBalanceSource: rentBalanceOverride ? "override" : "auto",
      deductions: deductions
        .filter((d) => d.description.trim() && (parseFloat(d.amount) || 0) > 0)
        .map((d) => ({
          description: d.description.trim(),
          amount: parseFloat(d.amount) || 0,
          category: d.category,
        })),
      keysReturned: keys,
      utilityTransfers: utilities,
      refundMethod: refundMethod || null,
      refundDetails,
      notes,
      finalMeterReadings: finalInputs,
      conditionReportId,
    };
  }

  // Fill the condition, keys and final readings from the move-out inspection.
  // The manager still prices the damage and decides every deduction.
  function fillFromInspection() {
    const insp = data?.moveOutInspection;
    if (!insp) return;
    const p = insp.prefill;
    if (p.damagedCount > 0) {
      setDamageFound(p.damageFound || damageFound);
      // The checkout keeps at most 2,000 characters of description.
      setInventoryDamageNotes((prev) => (prev.trim() ? `${prev.trim()}\n${p.damageNotes}` : p.damageNotes).slice(0, 2000));
    }
    setKeys(p.keysReturned);
    if (p.otherKeys.length) {
      const line = `Other keys returned: ${p.otherKeys.join(", ")}`;
      setNotes((prev) => (prev.includes(line) ? prev : prev.trim() ? `${prev.trim()}\n${line}` : line));
    }
    if (p.finalMeterReadings.length) {
      setFinalReadings((prev) => {
        const next = { ...prev };
        for (const r of p.finalMeterReadings) if (!next[r.meterId]) next[r.meterId] = String(r.reading);
        return next;
      });
    }
    setConditionReportId(insp.id);
    toast.success("Filled from the move-out inspection — check the amounts before saving");
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error?.formErrors?.[0] || err?.error || "Failed to save");
        return;
      }
      toast.success("Draft saved");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!confirm("Finalize this checkout? This will mark the tenant as vacated, set the unit to VACANT, and lock further edits.")) {
      return;
    }
    setFinalizing(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/checkout/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to finalize");
        return;
      }
      const result = await res.json();
      toast.success("Checkout finalized");
      // Open the PDF in a new tab
      if (result.checkoutId) {
        window.open(`/api/checkouts/${result.checkoutId}/pdf`, "_blank");
      }
      router.push(`/tenants/${tenantId}`);
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-gold" size={28} />
      </div>
    );
  }
  if (!data) {
    return <p className="text-body text-gray-400 text-center py-10">Tenant not found.</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {/* Shown only while the checkout is still editable (no record yet, or IN_PROGRESS) */}
        {(data.checkout === null || data.checkout.status === "IN_PROGRESS") && (
          <div>
            <TutorialVideo tutorialKey="tenant-checkout" variant="link" />
          </div>
        )}
        {isCompleted && (
          <Card className="!p-4 border border-amber-200 bg-amber-50/50">
            <div className="flex items-center gap-2 text-amber-800">
              <Lock size={16} />
              <p className="text-body font-medium ">
                This checkout was finalized on {data.checkout?.checkOutDate ? format(new Date(data.checkout.checkOutDate), "d MMM yyyy") : ""}. Form is read-only.
              </p>
            </div>
            {data.checkout && (
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <a
                  href={`/api/checkouts/${data.checkout.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-body text-blue-600 hover:underline"
                >
                  <Download size={14} /> Download PDF
                </a>
                {data.checkout.tenantSignedAt ? (
                  <span className="inline-flex items-center gap-1.5 text-body text-income">
                    ✓ Acknowledged by {data.checkout.tenantSignedName} on{" "}
                    {format(new Date(data.checkout.tenantSignedAt), "d MMM yyyy")}
                  </span>
                ) : (
                  <button
                    onClick={requestSignature}
                    disabled={requestingSign}
                    className="inline-flex items-center gap-1.5 text-body text-gold hover:underline disabled:opacity-50"
                  >
                    {requestingSign
                      ? "Sending…"
                      : data.checkout.signatureRequestedAt
                        ? "Re-send tenant sign-off link"
                        : "Request tenant sign-off"}
                  </button>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Header summary */}
        <Card>
          <h2 className=" text-h3 text-header mb-3">{data.tenant.name}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-body ">
            <Field label="Unit" value={data.unit.unitNumber} />
            <Field label="Property" value={data.property.name} />
            <Field label="Lease Start" value={format(new Date(data.tenant.leaseStart), "d MMM yyyy")} />
            <Field
              label="Lease End"
              value={data.tenant.leaseEnd ? format(new Date(data.tenant.leaseEnd), "d MMM yyyy") : "—"}
            />
            <Field label="Monthly Rent" value={formatCurrency(data.tenant.monthlyRent, currency)} />
            <Field label="Deposit Held" value={formatCurrency(deposit, currency)} />
            <Field label="Phone" value={data.tenant.phone ?? "—"} />
            <Field label="Email" value={data.tenant.email ?? "—"} />
          </div>
          {depositShortfall > 0 && (
            <div className="mt-3 border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 text-body text-amber-800">
              Deposit received {formatCurrency(depositPosition!.received ?? 0, currency)} of the
              contractual {formatCurrency(depositPosition!.contractual, currency)} — the settlement
              below refunds only what was actually received
              (shortfall {formatCurrency(depositShortfall, currency)}).
            </div>
          )}
          {depositUnverified && data.tenant.depositAmount > 0 && (
            <div className="mt-3 border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 text-body text-amber-800">
              No deposit receipts are recorded for this tenant — the settlement uses the
              contractual amount. Verify the deposit was actually received in full before refunding,
              or record the deposit on the Income page first.
            </div>
          )}
        </Card>

        {/* Check-out date */}
        <Card>
          <Section title="Check-Out Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Date of Check Out"
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                disabled={isCompleted}
              />
            </div>
          </Section>
        </Card>

        {/* 1. Condition Report */}
        <Card>
          <Section title="1. Inventory & Property Condition">
            {data?.moveOutInspection && !isCompleted && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-body text-blue-900 space-y-2">
                <p className="flex items-start gap-2">
                  <ClipboardCheck size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Move-out inspection {data.moveOutInspection.status === "ACCEPTED" ? "accepted" : "handed in (not yet accepted)"}
                    {data.moveOutInspection.submittedByName ? ` — by ${data.moveOutInspection.submittedByName}` : ""}
                    {data.moveOutInspection.submittedAt ? ` on ${format(new Date(data.moveOutInspection.submittedAt), "d MMM yyyy")}` : ""}.
                    {" "}{data.moveOutInspection.prefill.damagedCount > 0
                      ? `${data.moveOutInspection.prefill.damagedCount} item${data.moveOutInspection.prefill.damagedCount === 1 ? "" : "s"} in fair or poor condition.`
                      : "No damage recorded."}
                    {data.moveOutInspection.tenantDisagrees ? " The tenant disagrees with part of it." : ""}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={fillFromInspection}>
                    {conditionReportId === data.moveOutInspection.id ? "Fill again from the inspection" : "Fill from the inspection"}
                  </Button>
                  <Link href={`/inspections/${data.moveOutInspection.id}`} className="inline-flex">
                    <Button size="sm" variant="ghost">Open inspection</Button>
                  </Link>
                </div>
                <p className="text-caption text-blue-800">Fills the damage description, keys returned and final meter readings. You still set the amount charged.</p>
              </div>
            )}
            <p className="text-body text-gray-600 mb-2">Was there any damage / breakage to the inventory?</p>
            <div className="flex items-center gap-4">
              <ToggleRadio
                checked={damageFound}
                onChange={() => setDamageFound(true)}
                label="Yes"
                disabled={isCompleted}
              />
              <ToggleRadio
                checked={!damageFound}
                onChange={() => setDamageFound(false)}
                label="No"
                disabled={isCompleted}
              />
            </div>
            {damageFound && (
              <div className="mt-4 space-y-3">
                <Input
                  label="Amount Charged"
                  type="number"
                  min={0}
                  step="0.01"
                  prefix={currency}
                  value={inventoryDamageAmount}
                  onChange={(e) => setInventoryDamageAmount(e.target.value)}
                  disabled={isCompleted}
                />
                <div>
                  <label className="text-body font-medium text-gray-600 block mb-1">
                    Description of damages
                  </label>
                  <textarea
                    rows={3}
                    value={inventoryDamageNotes}
                    onChange={(e) => setInventoryDamageNotes(e.target.value)}
                    disabled={isCompleted}
                    className="w-full border border-gray-200 rounded-lg text-body px-3 py-2.5 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                </div>
                <label className="flex items-center gap-2 text-body text-gray-600">
                  <input
                    type="checkbox"
                    checked={damageKeptByLandlord}
                    onChange={(e) => setDamageKeptByLandlord(e.target.checked)}
                    disabled={isCompleted}
                  />
                  Charge to landlord as a property expense (creates an ExpenseEntry)
                </label>
              </div>
            )}
          </Section>
        </Card>

        {/* 2. Rent Balance */}
        <Card>
          <Section title="2. Rent Balance">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Balance Owing"
                  type="number"
                  min={0}
                  step="0.01"
                  prefix={currency}
                  value={rentBalanceOwing}
                  onChange={(e) => setRentBalanceOwing(e.target.value)}
                  disabled={isCompleted || !rentBalanceOverride}
                  help={
                    rentBalanceOverride
                      ? "Manual override"
                      : `Auto from outstanding invoices: ${formatCurrency(data.outstandingBalance, currency)}`
                  }
                />
              </div>
              {!isCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (rentBalanceOverride) {
                      // Reset to auto
                      setRentBalanceOwing(String(data.outstandingBalance.toFixed(2)));
                      setRentBalanceOverride(false);
                    } else {
                      setRentBalanceOverride(true);
                    }
                  }}
                  type="button"
                >
                  <Pencil size={14} /> {rentBalanceOverride ? "Use auto" : "Override"}
                </Button>
              )}
            </div>
          </Section>
        </Card>

        {/* 3. Deductions */}
        <Card>
          <Section title="3. Itemised Deductions">
            {!isCompleted && (
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_ADD.filter((q) => !(hasMeters && METERED_QUICK_ADD.has(q.label))).map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => addDeduction(q.label, q.category)}
                    className="text-caption px-2.5 py-1 border border-gray-200 hover:border-gold hover:text-gold rounded-lg transition-colors"
                  >
                    + {q.label}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {deductions.length === 0 ? (
                <p className="text-body text-gray-400 italic">No deductions added.</p>
              ) : (
                deductions.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={d.description}
                      onChange={(e) => updateDeduction(i, "description", e.target.value)}
                      disabled={isCompleted}
                      className="flex-1 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      min={0}
                      step="0.01"
                      value={d.amount}
                      onChange={(e) => updateDeduction(i, "amount", e.target.value)}
                      disabled={isCompleted}
                      className="w-32 border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                    {!isCompleted && (
                      <button
                        type="button"
                        onClick={() => removeDeduction(i)}
                        className="p-2 text-gray-400 hover:text-red-500"
                        aria-label="Remove deduction"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            {!isCompleted && (
              <button
                type="button"
                onClick={() => addDeduction()}
                className="mt-3 text-caption text-gold hover:text-gold-dark inline-flex items-center gap-1"
              >
                <Plus size={14} /> Add custom deduction
              </button>
            )}
            <p className="mt-3 text-body text-gray-600">
              Total deductions: <strong>{formatCurrency(totalDeductions, currency)}</strong>
            </p>
          </Section>
        </Card>

        {/* 4. Final meter readings (metered units only) */}
        {(hasMeters || (isCompleted && (data.checkout?.finalUtilitiesAmount ?? 0) > 0)) && (
          <Card>
            <Section title="4. Final Meter Readings">
              {isCompleted ? (
                <p className="text-body text-gray-600">
                  Water &amp; electricity charged at move-out:{" "}
                  <strong>{formatCurrency(data.checkout?.finalUtilitiesAmount ?? 0, currency)}</strong>
                  {data.checkout?.finalUtilitiesInvoiceId && (
                    <>
                      {" "}—{" "}
                      <a href={`/invoices?focus=${data.checkout.finalUtilitiesInvoiceId}`} className="text-gold-dark hover:underline">
                        view the final invoice
                      </a>
                    </>
                  )}
                  .
                </p>
              ) : finalUtilities && finalCharge ? (
                <FinalReadingsSection
                  data={finalUtilities}
                  charge={finalCharge}
                  readings={finalReadings}
                  onChange={(meterId, value) => setFinalReadings((p) => ({ ...p, [meterId]: value }))}
                  currency={currency}
                />
              ) : null}
            </Section>
          </Card>
        )}

        {/* 6. Keys */}
        <Card>
          <Section title="6. Keys Returned">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["mainDoor", "bedroom", "gate", "mailbox"] as const).map((k) => (
                <Input
                  key={k}
                  label={
                    k === "mainDoor" ? "Main Door"
                    : k === "bedroom" ? "Bedroom"
                    : k === "gate" ? "Gate / Common"
                    : "Mailbox"
                  }
                  type="number"
                  min={0}
                  value={keys[k] ?? 0}
                  onChange={(e) => setKeys({ ...keys, [k]: parseInt(e.target.value, 10) || 0 })}
                  disabled={isCompleted}
                />
              ))}
            </div>
          </Section>
        </Card>

        {/* 7. Utility transfer */}
        <Card>
          <Section title="7. Utility Account Transfer">
            <div className="space-y-3">
              {(["electricity", "water", "internet"] as const).map((k) => {
                const labelMap = { electricity: "Electricity transferred", water: "Water transferred", internet: "Internet disconnected" };
                const u = utilities[k] ?? { done: false, date: "" };
                return (
                  <div key={k} className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-body w-56">
                      <input
                        type="checkbox"
                        checked={!!u.done}
                        onChange={(e) => setUtilities({ ...utilities, [k]: { ...u, done: e.target.checked } })}
                        disabled={isCompleted}
                      />
                      {labelMap[k]}
                    </label>
                    <input
                      type="date"
                      value={u.date ?? ""}
                      onChange={(e) => setUtilities({ ...utilities, [k]: { ...u, date: e.target.value } })}
                      disabled={isCompleted || !u.done}
                      className="border border-gray-200 rounded-lg text-body px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
                    />
                  </div>
                );
              })}
            </div>
          </Section>
        </Card>

        {/* 8. Refund instructions */}
        <Card>
          <Section title="8. Refund Instructions">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Refund Method"
                options={REFUND_OPTIONS}
                value={refundMethod}
                onChange={(e) => setRefundMethod((e.target.value as RefundMethod) || "")}
                disabled={isCompleted}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {refundMethod === "CHEQUE" && (
                <Input
                  label="Payable to"
                  value={refundDetails.payableTo ?? ""}
                  onChange={(e) => setRefundDetails({ ...refundDetails, payableTo: e.target.value })}
                  disabled={isCompleted}
                />
              )}
              {refundMethod === "CASH" && (
                <Input
                  label="Recipient Name"
                  value={refundDetails.recipientName ?? ""}
                  onChange={(e) => setRefundDetails({ ...refundDetails, recipientName: e.target.value })}
                  disabled={isCompleted}
                />
              )}
              {refundMethod === "MOBILE_TRANSFER" && (
                <Input
                  label="Mobile Number"
                  value={refundDetails.mobileNumber ?? ""}
                  onChange={(e) => setRefundDetails({ ...refundDetails, mobileNumber: e.target.value })}
                  disabled={isCompleted}
                />
              )}
              {refundMethod === "BANK_TRANSFER" && (
                <>
                  <Input
                    label="Account Number"
                    value={refundDetails.accountNumber ?? ""}
                    onChange={(e) => setRefundDetails({ ...refundDetails, accountNumber: e.target.value })}
                    disabled={isCompleted}
                  />
                  <Input
                    label="Bank Name"
                    value={refundDetails.bankName ?? ""}
                    onChange={(e) => setRefundDetails({ ...refundDetails, bankName: e.target.value })}
                    disabled={isCompleted}
                  />
                  <Input
                    label="Account Name"
                    value={refundDetails.accountName ?? ""}
                    onChange={(e) => setRefundDetails({ ...refundDetails, accountName: e.target.value })}
                    disabled={isCompleted}
                  />
                </>
              )}
            </div>
          </Section>
        </Card>

        {/* 9. Notes */}
        <Card>
          <Section title="9. Additional Notes / Comments">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isCompleted}
              className="w-full border border-gray-200 rounded-lg text-body px-3 py-2.5 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </Section>
        </Card>
      </div>

      {/* Sticky settlement box */}
      <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
        <Card className="!p-5">
          <h3 className=" text-h3 text-header mb-4">Final Settlement</h3>
          <SettleRow
            label={depositUnverified ? "Deposit (contractual)" : "Deposit Received"}
            value={formatCurrency(deposit, currency)}
          />
          <SettleRow label="− Inventory Damage" value={formatCurrency(inventoryDamage, currency)} />
          <SettleRow label="− Rent Balance"     value={formatCurrency(rentBal, currency)} />
          <SettleRow label="− Itemised Deductions" value={formatCurrency(totalDeductions, currency)} />
          {(hasMeters || finalUtilitiesTotal > 0) && (
            <SettleRow label="− Water &amp; Electricity" value={formatCurrency(finalUtilitiesTotal, currency)} />
          )}
          <hr className="my-3 border-gray-200" />
          <div
            className={`rounded-lg px-3 py-3 ${
              isOwed ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"
            }`}
          >
            <p className={`text-label uppercase ${isOwed ? "text-red-700" : "text-green-700"}`}>
              {isOwed ? "Balance Owed by Tenant" : "Balance to Refund"}
            </p>
            <p
              className={` text-h1 mt-1 ${
                isOwed ? "text-red-700" : "text-green-700"
              }`}
            >
              {formatCurrency(Math.abs(balanceToRefund), currency)}
            </p>
          </div>

          {!isCompleted && (
            <div className="flex flex-col gap-2 mt-5">
              <Button onClick={saveDraft} variant="secondary" loading={saving}>
                <Save size={14} /> Save Draft
              </Button>
              <Button onClick={finalize} variant="primary" loading={finalizing}>
                <FileText size={14} /> Finalize Checkout
              </Button>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

/**
 * Move-out readings: one input per unit meter for the check-out month, the
 * live charge at the month's rate, and the tenant's earlier readings that
 * never reached an invoice. Finalising approves them all, puts them on one
 * final invoice and settles it from what is left of the deposit.
 */
function FinalReadingsSection({
  data,
  charge,
  readings,
  onChange,
  currency,
}: {
  data: FinalUtilitiesData;
  charge: ReturnType<typeof finalUtilitiesCharge>;
  readings: Record<string, string>;
  onChange: (meterId: string, value: string) => void;
  currency: string;
}) {
  const month = monthName(data.periodYear, data.periodMonth);
  return (
    <div className="space-y-4">
      <p className="text-body text-gray-600">
        Read each meter on the day the tenant leaves. The use since the last reading is charged at {month}&apos;s rate on a final
        water &amp; electricity invoice, which is paid from the deposit where it covers it.
      </p>

      {data.meters.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="py-2 pr-3 text-label uppercase text-gray-400 font-medium">Meter</th>
                <th className="py-2 px-3 text-label uppercase text-gray-400 font-medium text-right">Previous</th>
                <th className="py-2 px-3 text-label uppercase text-gray-400 font-medium w-36">Final reading</th>
                <th className="py-2 px-3 text-label uppercase text-gray-400 font-medium text-right">Used</th>
                <th className="py-2 pl-3 text-label uppercase text-gray-400 font-medium text-right">Charge</th>
              </tr>
            </thead>
            <tbody>
              {data.meters.map((m) => {
                const line = charge.lines.find((l) => l.kind === "FINAL" && l.meterId === m.meterId);
                const error = charge.errors.find((e) => e.meterId === m.meterId);
                const takes = meterTakesFinalReading(m);
                return (
                  <tr key={m.meterId} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{m.label}</p>
                      {m.meterNumber && <p className="text-caption text-gray-400">No. {m.meterNumber}</p>}
                      {error && <p className="text-caption text-expense mt-0.5">{error.error.replace(`${m.label}: `, "")}</p>}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmtMeter(m.previousReading)}</td>
                    <td className="py-2 px-3">
                      {takes ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Final reading, ${m.label}`}
                          value={readings[m.meterId] ?? ""}
                          onChange={(e) => onChange(m.meterId, e.target.value)}
                          placeholder="—"
                          className="w-full text-right tabular-nums border border-gray-200 rounded-lg px-2 py-1 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
                        />
                      ) : (
                        <span className="text-caption text-gray-400">
                          {m.locked ? "A later month is already read" : "Already on an invoice"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-900">
                      {line ? `${fmtMeter(line.consumption)} ${m.unitLabel}` : "—"}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-gray-900">
                      {line ? formatCurrency(line.amount, currency) : "—"}
                      {line?.ratePerUnit != null && (
                        <p className="text-caption text-gray-400">@ {formatCurrency(line.ratePerUnit, currency)}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.unbilled.length > 0 && (
        <div>
          <p className="text-body font-medium text-gray-900">Earlier readings not on an invoice yet</p>
          <ul className="mt-1 divide-y divide-gray-50">
            {data.unbilled.map((u) => (
              <li key={u.readingId} className="flex items-center justify-between gap-3 py-1.5 text-body">
                <span className="text-gray-600">
                  {monthName(u.periodYear, u.periodMonth)} · {u.label} · {fmtMeter(u.consumption)}
                  {u.status === "SUBMITTED" && <span className="text-caption text-amber-700"> · approved when you finalise</span>}
                  {u.warning && <span className="block text-caption text-amber-700">⚠ {u.warning} Check it on Utilities → Review &amp; bill if unsure.</span>}
                </span>
                <span className="tabular-nums text-gray-900">{formatCurrency(u.amount, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {charge.errors
        .filter((e) => !data.meters.some((m) => m.meterId === e.meterId && meterTakesFinalReading(m)))
        .map((e) => (
          <p key={e.meterId + e.error} className="text-caption text-expense">{e.error}</p>
        ))}
      {charge.missing.length > 0 && (
        <p className="text-caption text-amber-700">Enter the final reading for: {charge.missing.join(", ")} — needed before you finalise.</p>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-body">
        <span className="text-gray-600">
          Water {formatCurrency(charge.water, currency)} · Electricity {formatCurrency(charge.electricity, currency)}
        </span>
        <span className="font-medium text-header">Total {formatCurrency(charge.total, currency)}</span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-label text-gray-400 uppercase ">{label}</p>
      <p className="text-body text-header font-medium mt-0.5">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className=" text-h3 text-header mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRadio({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`px-4 py-2 border rounded-lg text-body transition-colors ${
        checked
          ? "border-gold bg-gold/10 text-gold-dark"
          : "border-gray-200 text-gray-500 hover:border-gold/50"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function SettleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-body py-1">
      <span className="text-gray-600">{label}</span>
      <span className="tabular-nums text-header">{value}</span>
    </div>
  );
}
