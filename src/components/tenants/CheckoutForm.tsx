"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { Plus, Trash2, FileText, Save, Loader2, Pencil, Lock, Download } from "lucide-react";
import toast from "react-hot-toast";

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
  totalDeductions: number;
  balanceToRefund: number;
  keysReturned: KeysReturned | null;
  utilityTransfers: UtilityTransfers | null;
  refundMethod: RefundMethod | null;
  refundDetails: RefundDetails | null;
  notes: string | null;
  deductions: { id: string; description: string; amount: number; category: DeductionCategory }[];
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

  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

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

  const totalDeductions = useMemo(
    () => deductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0),
    [deductions]
  );

  const inventoryDamage = damageFound ? parseFloat(inventoryDamageAmount) || 0 : 0;
  const rentBal = parseFloat(rentBalanceOwing) || 0;
  const deposit = data?.tenant.depositAmount ?? 0;
  const balanceToRefund = deposit - inventoryDamage - rentBal - totalDeductions;
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
    };
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
    return <p className="text-sm text-gray-400 font-sans text-center py-10">Tenant not found.</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-5">
        {isCompleted && (
          <Card className="!p-4 border border-amber-200 bg-amber-50/50">
            <div className="flex items-center gap-2 text-amber-800">
              <Lock size={16} />
              <p className="text-sm font-medium font-sans">
                This checkout was finalized on {data.checkout?.checkOutDate ? format(new Date(data.checkout.checkOutDate), "d MMM yyyy") : ""}. Form is read-only.
              </p>
            </div>
            {data.checkout && (
              <div className="mt-3">
                <a
                  href={`/api/checkouts/${data.checkout.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <Download size={14} /> Download PDF
                </a>
              </div>
            )}
          </Card>
        )}

        {/* Header summary */}
        <Card>
          <h2 className="font-display text-lg text-header mb-3">{data.tenant.name}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm font-sans">
            <Field label="Unit" value={data.unit.unitNumber} />
            <Field label="Property" value={data.property.name} />
            <Field label="Lease Start" value={format(new Date(data.tenant.leaseStart), "d MMM yyyy")} />
            <Field
              label="Lease End"
              value={data.tenant.leaseEnd ? format(new Date(data.tenant.leaseEnd), "d MMM yyyy") : "—"}
            />
            <Field label="Monthly Rent" value={formatCurrency(data.tenant.monthlyRent, currency)} />
            <Field label="Deposit Held" value={formatCurrency(data.tenant.depositAmount, currency)} />
            <Field label="Phone" value={data.tenant.phone ?? "—"} />
            <Field label="Email" value={data.tenant.email ?? "—"} />
          </div>
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
            <p className="text-sm font-sans text-gray-600 mb-2">Was there any damage / breakage to the inventory?</p>
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
                  <label className="text-sm font-medium text-gray-600 font-sans block mb-1">
                    Description of damages
                  </label>
                  <textarea
                    rows={3}
                    value={inventoryDamageNotes}
                    onChange={(e) => setInventoryDamageNotes(e.target.value)}
                    disabled={isCompleted}
                    className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2.5 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-sans text-gray-600">
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
                {QUICK_ADD.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => addDeduction(q.label, q.category)}
                    className="text-xs font-sans px-2.5 py-1 border border-gray-200 hover:border-gold hover:text-gold rounded-lg transition-colors"
                  >
                    + {q.label}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {deductions.length === 0 ? (
                <p className="text-sm text-gray-400 font-sans italic">No deductions added.</p>
              ) : (
                deductions.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={d.description}
                      onChange={(e) => updateDeduction(i, "description", e.target.value)}
                      disabled={isCompleted}
                      className="flex-1 border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      min={0}
                      step="0.01"
                      value={d.amount}
                      onChange={(e) => updateDeduction(i, "amount", e.target.value)}
                      disabled={isCompleted}
                      className="w-32 border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
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
                className="mt-3 text-xs font-sans text-gold hover:text-gold-dark inline-flex items-center gap-1"
              >
                <Plus size={14} /> Add custom deduction
              </button>
            )}
            <p className="mt-3 text-sm font-sans text-gray-600">
              Total deductions: <strong>{formatCurrency(totalDeductions, currency)}</strong>
            </p>
          </Section>
        </Card>

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
                    <label className="flex items-center gap-2 text-sm font-sans w-56">
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
                      className="border border-gray-200 rounded-lg text-sm font-sans px-3 py-2 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
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
              className="w-full border border-gray-200 rounded-lg text-sm font-sans px-3 py-2.5 bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </Section>
        </Card>
      </div>

      {/* Sticky settlement box */}
      <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
        <Card className="!p-5">
          <h3 className="font-display text-base text-header mb-4">Final Settlement</h3>
          <SettleRow label="Original Deposit"  value={formatCurrency(deposit, currency)} />
          <SettleRow label="− Inventory Damage" value={formatCurrency(inventoryDamage, currency)} />
          <SettleRow label="− Rent Balance"     value={formatCurrency(rentBal, currency)} />
          <SettleRow label="− Itemised Deductions" value={formatCurrency(totalDeductions, currency)} />
          <hr className="my-3 border-gray-200" />
          <div
            className={`rounded-lg px-3 py-3 ${
              isOwed ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"
            }`}
          >
            <p className={`text-xs uppercase tracking-wide font-sans ${isOwed ? "text-red-700" : "text-green-700"}`}>
              {isOwed ? "Balance Owed by Tenant" : "Balance to Refund"}
            </p>
            <p
              className={`font-display text-2xl mt-1 ${
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-sans uppercase tracking-wide">{label}</p>
      <p className="text-sm text-header font-medium mt-0.5">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-base text-header mb-3">{title}</h3>
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
      className={`px-4 py-2 border rounded-lg text-sm font-sans transition-colors ${
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
    <div className="flex items-center justify-between text-sm font-sans py-1">
      <span className="text-gray-600">{label}</span>
      <span className="font-mono text-header">{value}</span>
    </div>
  );
}
