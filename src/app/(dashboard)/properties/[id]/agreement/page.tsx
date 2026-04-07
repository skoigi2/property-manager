"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ArrowLeft, DollarSign, Clock, Target, AlertTriangle, Download, Trash2, X, Loader2, CreditCard, Building2 } from "lucide-react";
import { Input } from "@/components/ui/Input";

const schema = z.object({
  managementFeeRate:              z.coerce.number().min(0).max(100),
  vacancyFeeRate:                 z.coerce.number().min(0).max(100),
  vacancyFeeThresholdMonths:      z.coerce.number().int().min(1),
  newLettingFeeRate:              z.coerce.number().min(0).max(100),
  leaseRenewalFeeFlat:            z.coerce.number().min(0),
  shortTermLettingFeeRate:        z.coerce.number().min(0).max(100),
  repairAuthorityLimit:           z.coerce.number().min(0),
  setupFeeTotal:                  z.coerce.number().min(0).optional().or(z.literal("")),
  setupFeeInstalments:            z.coerce.number().int().min(1),
  rentRemittanceDay:              z.coerce.number().int().min(1).max(28),
  mgmtFeeInvoiceDay:              z.coerce.number().int().min(1).max(28),
  landlordPaymentDays:            z.coerce.number().int().min(1),
  kpiStartDate:                   z.string().optional(),
  kpiOccupancyTarget:             z.coerce.number().min(0).max(100),
  kpiRentCollectionTarget:        z.coerce.number().min(0).max(100),
  kpiExpenseRatioTarget:          z.coerce.number().min(0).max(100),
  kpiTenantTurnoverTarget:        z.coerce.number().min(0).max(100),
  kpiDaysToLeaseTarget:           z.coerce.number().int().min(1),
  kpiRenewalRateTarget:           z.coerce.number().min(0).max(100),
  kpiMaintenanceCompletionTarget: z.coerce.number().min(0).max(100),
  kpiEmergencyResponseHrs:        z.coerce.number().int().min(1),
  kpiStandardResponseHrs:         z.coerce.number().int().min(1),
  latePaymentInterestRate:        z.coerce.number().min(0).max(100),
  // Tenant invoice payment details
  tenantKraPin:              z.string().optional(),
  tenantBankName:            z.string().optional(),
  tenantBankAccountName:     z.string().optional(),
  tenantBankAccountNumber:   z.string().optional(),
  tenantBankBranch:          z.string().optional(),
  tenantMpesaPaybill:        z.string().optional(),
  tenantMpesaAccountNumber:  z.string().optional(),
  tenantMpesaTill:           z.string().optional(),
  tenantPaymentInstructions: z.string().optional(),
  // Manager billing details
  mgmtKraPin:                z.string().optional(),
  mgmtBankName:              z.string().optional(),
  mgmtBankAccountName:       z.string().optional(),
  mgmtBankAccountNumber:     z.string().optional(),
  mgmtBankBranch:            z.string().optional(),
  mgmtMpesaPaybill:          z.string().optional(),
  mgmtMpesaAccountNumber:    z.string().optional(),
  mgmtMpesaTill:             z.string().optional(),
  mgmtPaymentInstructions:   z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
      <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-gold" />
      </div>
      <div>
        <h3 className="font-display text-header text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 font-sans">{subtitle}</p>}
      </div>
    </div>
  );
}


export default function AgreementPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [propertyName, setPropertyName] = useState("");
  const [unitCount,   setUnitCount]   = useState(0);
  const [exporting,   setExporting]   = useState(false);
  const [showDelete,  setShowDelete]  = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting,    setDeleting]    = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      managementFeeRate: 8.5, vacancyFeeRate: 5, vacancyFeeThresholdMonths: 9,
      newLettingFeeRate: 50, leaseRenewalFeeFlat: 3000, shortTermLettingFeeRate: 10,
      repairAuthorityLimit: 100000, setupFeeInstalments: 3,
      rentRemittanceDay: 5, mgmtFeeInvoiceDay: 7, landlordPaymentDays: 2,
      kpiOccupancyTarget: 90, kpiRentCollectionTarget: 90, kpiExpenseRatioTarget: 85,
      kpiTenantTurnoverTarget: 90, kpiDaysToLeaseTarget: 60, kpiRenewalRateTarget: 90,
      kpiMaintenanceCompletionTarget: 95, kpiEmergencyResponseHrs: 24, kpiStandardResponseHrs: 96,
      latePaymentInterestRate: 0,
      tenantKraPin: "",
      tenantBankName: "", tenantBankAccountName: "", tenantBankAccountNumber: "", tenantBankBranch: "",
      tenantMpesaPaybill: "", tenantMpesaAccountNumber: "", tenantMpesaTill: "", tenantPaymentInstructions: "",
      mgmtKraPin: "",
      mgmtBankName: "", mgmtBankAccountName: "", mgmtBankAccountNumber: "", mgmtBankBranch: "",
      mgmtMpesaPaybill: "", mgmtMpesaAccountNumber: "", mgmtMpesaTill: "", mgmtPaymentInstructions: "",
    },
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/properties/${params.id}/agreement`).then((r) => r.json()),
      fetch(`/api/properties`).then((r) => r.json()),
    ]).then(([agr, props]) => {
      const prop = (props as any[]).find((p) => p.id === params.id);
      if (prop) { setPropertyName(prop.name); setUnitCount(prop.units?.length ?? 0); }
      if (agr && agr.propertyId) {
        reset({
          ...agr,
          kpiStartDate: agr.kpiStartDate ? agr.kpiStartDate.slice(0, 10) : "",
          setupFeeTotal: agr.setupFeeTotal ?? "",
        });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.id, reset]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/properties/${params.id}/export`);
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const cd   = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="(.+?)"/);
      a.href     = url;
      a.download = match?.[1] ?? `PropertyHandover_${propertyName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Handover package downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/properties/${params.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Delete failed"); return; }
      toast.success(`${propertyName} has been deleted`);
      router.push("/properties");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    const textFields = [
      "tenantKraPin",
      "tenantBankName","tenantBankAccountName","tenantBankAccountNumber","tenantBankBranch",
      "tenantMpesaPaybill","tenantMpesaAccountNumber","tenantMpesaTill","tenantPaymentInstructions",
      "mgmtKraPin",
      "mgmtBankName","mgmtBankAccountName","mgmtBankAccountNumber","mgmtBankBranch",
      "mgmtMpesaPaybill","mgmtMpesaAccountNumber","mgmtMpesaTill","mgmtPaymentInstructions",
    ] as const;
    const payload: Record<string, unknown> = {
      ...values,
      setupFeeTotal: values.setupFeeTotal === "" ? null : values.setupFeeTotal,
    };
    textFields.forEach((f) => { if (payload[f] === "") payload[f] = null; });
    const res = await fetch(`/api/properties/${params.id}/agreement`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save agreement"); return; }
    toast.success("Agreement saved");
  };

  if (loading) {
    return (
      <div>
        <Header title="Management Agreement" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
        <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Management Agreement" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role}>
        <Button variant="secondary" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
        <Button size="sm" onClick={handleSubmit(onSubmit)} loading={saving}>
          Save Agreement
        </Button>
      </Header>

      <div className="page-container">
        {propertyName && (
          <p className="text-sm text-gray-500 font-sans mb-6">
            Configuring agreement for <span className="font-semibold text-header">{propertyName}</span>
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Fee Structure ── */}
          <Card>
            <SectionHeader icon={DollarSign} title="Fee Structure" subtitle="Rates charged to the property owner" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input type="number" step="0.1" label="Management Fee (%)" help="% of gross collected rent per month" error={errors.managementFeeRate?.message} placeholder="8.5" {...register("managementFeeRate")} />
              <Input type="number" step="0.1" label="Vacancy Fee (%)" help="% of last gross rent after vacancy threshold" error={errors.vacancyFeeRate?.message} placeholder="5" {...register("vacancyFeeRate")} />
              <Input type="number" label="Vacancy Threshold (months)" help="Months vacant before fee kicks in" error={errors.vacancyFeeThresholdMonths?.message} placeholder="9" {...register("vacancyFeeThresholdMonths")} />
              <Input type="number" step="0.1" label="New Letting Fee (%)" help="% of first month's rent for new long-term tenancy" error={errors.newLettingFeeRate?.message} placeholder="50" {...register("newLettingFeeRate")} />
              <Input type="number" label="Lease Renewal Fee" help="Flat fee per unit on lease renewal" error={errors.leaseRenewalFeeFlat?.message} placeholder="3000" {...register("leaseRenewalFeeFlat")} />
              <Input type="number" step="0.1" label="Short-term Letting Fee (%)" help="% of daily rent for short-term furnished lets" error={errors.shortTermLettingFeeRate?.message} placeholder="10" {...register("shortTermLettingFeeRate")} />
              <Input type="number" label="Repair Authority Limit" help="Max repair cost without landlord written approval" error={errors.repairAuthorityLimit?.message} placeholder="100000" {...register("repairAuthorityLimit")} />
              <Input type="number" step="0.1" label="Late Payment Interest (% p.a.)" help="Annual interest on overdue rent. Set to 0 to disable." error={errors.latePaymentInterestRate?.message} placeholder="0" {...register("latePaymentInterestRate")} />
              <Input type="number" label="Setup Fee Total" help="One-off setup fee (leave blank if none)" error={errors.setupFeeTotal?.message} placeholder="600000" {...register("setupFeeTotal")} />
              <Input type="number" label="Setup Fee Instalments" help="Number of equal monthly instalments" error={errors.setupFeeInstalments?.message} placeholder="3" {...register("setupFeeInstalments")} />
            </div>
          </Card>

          {/* ── Deadlines ── */}
          <Card>
            <SectionHeader icon={Clock} title="Payment Deadlines" subtitle="Contractual dates for remittance and invoicing" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input type="number" label="Rent Remittance Day" help="Day of month rent must be remitted to landlord" error={errors.rentRemittanceDay?.message} placeholder="5" {...register("rentRemittanceDay")} />
              <Input type="number" label="Mgmt Fee Invoice Day" help="Day of month management fee is invoiced" error={errors.mgmtFeeInvoiceDay?.message} placeholder="7" {...register("mgmtFeeInvoiceDay")} />
              <Input type="number" label="Landlord Payment Days" help="Days within which landlord must pay after collection" error={errors.landlordPaymentDays?.message} placeholder="2" {...register("landlordPaymentDays")} />
            </div>
          </Card>

          {/* ── KPI Targets ── */}
          <Card>
            <SectionHeader icon={Target} title="KPI Targets" subtitle="Performance benchmarks for the compliance dashboard" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Input type="date" label="KPI Monitoring Start Date" help="Date from which KPIs are measured (e.g. post-onboarding)" error={errors.kpiStartDate?.message} {...register("kpiStartDate")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input type="number" step="0.1" label="Occupancy Target (%)" error={errors.kpiOccupancyTarget?.message} placeholder="90" {...register("kpiOccupancyTarget")} />
              <Input type="number" step="0.1" label="Rent Collection Target (%)" error={errors.kpiRentCollectionTarget?.message} placeholder="90" {...register("kpiRentCollectionTarget")} />
              <Input type="number" step="0.1" label="Expense Ratio Target (%)" help="Lower is better (operating costs / gross income)" error={errors.kpiExpenseRatioTarget?.message} placeholder="85" {...register("kpiExpenseRatioTarget")} />
              <Input type="number" step="0.1" label="Tenant Turnover Target (%)" error={errors.kpiTenantTurnoverTarget?.message} placeholder="90" {...register("kpiTenantTurnoverTarget")} />
              <Input type="number" label="Days to Lease Target" help="Max days to re-let a vacant unit" error={errors.kpiDaysToLeaseTarget?.message} placeholder="60" {...register("kpiDaysToLeaseTarget")} />
              <Input type="number" step="0.1" label="Lease Renewal Rate Target (%)" error={errors.kpiRenewalRateTarget?.message} placeholder="90" {...register("kpiRenewalRateTarget")} />
              <Input type="number" step="0.1" label="Maintenance Completion Target (%)" help="% of jobs completed within SLA" error={errors.kpiMaintenanceCompletionTarget?.message} placeholder="95" {...register("kpiMaintenanceCompletionTarget")} />
              <Input type="number" label="Emergency Response SLA (hrs)" error={errors.kpiEmergencyResponseHrs?.message} placeholder="24" {...register("kpiEmergencyResponseHrs")} />
              <Input type="number" label="Standard Response SLA (hrs)" error={errors.kpiStandardResponseHrs?.message} placeholder="96" {...register("kpiStandardResponseHrs")} />
            </div>
          </Card>

          {/* ── Tenant Invoice Payment Details ── */}
          <Card>
            <SectionHeader
              icon={CreditCard}
              title="Tenant Invoice Payment Details"
              subtitle="Shown on rent invoices so tenants know where to send payment"
            />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-gray-100 pb-4">
                <Input label="KRA PIN / VAT Registration Number" placeholder="e.g. P051234567X" {...register("tenantKraPin")} />
              </div>
              <div className="border-b border-gray-100 pb-4">
                <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">Bank Transfer</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Bank Name" placeholder="e.g. Equity Bank" {...register("tenantBankName")} />
                  <Input label="Account Name" placeholder="e.g. Parkview Heights Ltd" {...register("tenantBankAccountName")} />
                  <Input label="Account Number" placeholder="e.g. 0123456789" {...register("tenantBankAccountNumber")} />
                  <Input label="Branch (optional)" placeholder="e.g. Westlands" {...register("tenantBankBranch")} />
                </div>
              </div>
              <div className="border-b border-gray-100 pb-4">
                <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">M-Pesa</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Paybill Number" placeholder="e.g. 522522" {...register("tenantMpesaPaybill")} />
                  <Input label="Account No (for Paybill)" placeholder="e.g. unit number" {...register("tenantMpesaAccountNumber")} />
                  <Input label="Till Number (alternative to Paybill)" placeholder="e.g. 123456" {...register("tenantMpesaTill")} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 font-sans">Additional Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold resize-none"
                  placeholder="e.g. Use your unit number as the payment reference."
                  {...register("tenantPaymentInstructions")} />
              </div>
            </div>
          </Card>

          {/* ── Manager Billing Details ── */}
          <Card>
            <SectionHeader
              icon={Building2}
              title="Manager Billing Details"
              subtitle="Shown on owner invoices so the property owner knows where to remit management fees"
            />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-gray-100 pb-4">
                <Input label="KRA PIN / VAT Registration Number" placeholder="e.g. P051234567X" {...register("mgmtKraPin")} />
              </div>
              <div className="border-b border-gray-100 pb-4">
                <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">Bank Transfer</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Bank Name" placeholder="e.g. KCB Bank" {...register("mgmtBankName")} />
                  <Input label="Account Name" placeholder="e.g. Koka Advisory Group" {...register("mgmtBankAccountName")} />
                  <Input label="Account Number" placeholder="e.g. 9876543210" {...register("mgmtBankAccountNumber")} />
                  <Input label="Branch (optional)" placeholder="e.g. Upper Hill" {...register("mgmtBankBranch")} />
                </div>
              </div>
              <div className="border-b border-gray-100 pb-4">
                <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">M-Pesa</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Paybill Number" placeholder="e.g. 522522" {...register("mgmtMpesaPaybill")} />
                  <Input label="Account No (for Paybill)" placeholder="e.g. invoice number" {...register("mgmtMpesaAccountNumber")} />
                  <Input label="Till Number (alternative to Paybill)" placeholder="e.g. 654321" {...register("mgmtMpesaTill")} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 font-sans">Additional Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={2} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold resize-none"
                  placeholder="e.g. Please quote invoice number on your bank transfer."
                  {...register("mgmtPaymentInstructions")} />
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-3 pb-6">
            <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Agreement</Button>
          </div>

        </form>

        {/* ── Danger Zone ── */}
        <div className="border border-red-200 rounded-2xl p-6 mt-2 mb-8 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={15} className="text-expense" />
            <h3 className="font-display text-expense text-sm">Danger Zone</h3>
          </div>

          {/* Export */}
          <div className="flex items-start justify-between gap-4 py-3 border-b border-red-100">
            <div>
              <p className="text-sm font-sans font-medium text-header">Download Handover Package</p>
              <p className="text-xs text-gray-400 font-sans mt-0.5">
                ZIP containing full financial history (XLSX) and all tenant documents
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 shrink-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-sans text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {exporting ? "Exporting…" : "Download"}
            </button>
          </div>

          {/* Delete */}
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-sans font-medium text-header">Delete this property</p>
              <p className="text-xs text-gray-400 font-sans mt-0.5">
                Permanently removes all units, tenants, and financial records. Cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setDeleteInput(""); setShowDelete(true); }}
              className="flex items-center gap-2 shrink-0 px-3 py-1.5 border border-red-200 rounded-lg text-sm font-sans text-expense hover:bg-red-50"
            >
              <Trash2 size={13} />
              Delete Property
            </button>
          </div>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-expense shrink-0" />
                <h3 className="font-display text-header text-base">Delete {propertyName}?</h3>
              </div>
              <button onClick={() => setShowDelete(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {/* Summary */}
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm font-sans space-y-1">
              <p className="font-medium text-expense">This will permanently delete:</p>
              <ul className="text-gray-600 text-xs space-y-0.5 mt-1 list-disc list-inside">
                <li>All units and all tenant records — including any currently active tenants</li>
                <li>All income, expense, and petty cash entries</li>
                <li>All owner invoices and management agreements</li>
                <li>All maintenance jobs, insurance policies, and assets</li>
                <li>All tenant documents (files will remain in storage)</li>
              </ul>
            </div>

            {/* Export reminder */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2 text-xs font-sans text-amber-800">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Have you downloaded the handover package?{" "}
                <button
                  type="button"
                  onClick={() => { setShowDelete(false); handleExport(); }}
                  className="underline font-medium hover:text-amber-900"
                >
                  Download now
                </button>
              </span>
            </div>

            {/* Name confirmation */}
            <div>
              <label className="text-xs text-gray-500 font-sans">
                Type <span className="font-semibold text-header">{propertyName}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={propertyName}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteInput !== propertyName}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-expense text-white text-sm font-sans rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete permanently
              </button>
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-sans rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
