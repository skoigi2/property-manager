"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { invalidatePaymentAccountCache } from "@/components/ui/PaymentAccountSelect";
import { CreditCard, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

interface PaymentAccount {
  id: string;
  name: string;
  companyName: string | null;
  logoUrl: string | null;
  kraPin: string | null;
  vatNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoiceFormat: string | null;
  invoiceNextNumber: number;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  mpesaPaybill: string | null;
  mpesaAccountNumber: string | null;
  mpesaTill: string | null;
  paymentInstructions: string | null;
  isActive: boolean;
  _count: { agreements: number; units: number };
}

/** Organisation-default invoice numbering — used by every invoice that
 *  doesn't resolve to a payment account with its own series. */
function OrgNumberingCard({ orgId }: { orgId: string }) {
  const [format, setFormat] = useState("");
  const [nextNumber, setNextNumber] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/organizations/${orgId}`)
      .then((r) => r.json())
      .then((org) => {
        setFormat(org?.invoiceFormat ?? "");
        setNextNumber(String(org?.invoiceNextNumber ?? 1));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [orgId]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { invoiceFormat: format.trim() || null };
      const n = parseInt(nextNumber, 10);
      if (!isNaN(n) && n >= 1) body.invoiceNextNumber = n;
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to save");
      }
      toast.success("Invoice numbering saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <Card padding="sm">
      <p className="text-sm font-sans font-semibold text-header">Invoice numbering — organisation default</p>
      <p className="text-[11px] text-gray-400 font-sans mt-0.5 mb-3">
        Applies to every invoice that doesn&apos;t use a payment account with its own series.
        Tokens: <code>{"{YYYY}"}</code> <code>{"{YY}"}</code> <code>{"{MM}"}</code> <code>{"{SEQ}"}</code>.
        Blank = <code>INV-{"{YYYYMM}"}-{"{SEQ}"}</code>. Set Next Number to continue from a previous system.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <Input label="Number Format" placeholder="INV-{YYYYMM}-{SEQ}" value={format}
          onChange={(e) => setFormat(e.target.value)} />
        <Input label="Next Number" type="number" min="1" step="1" value={nextNumber}
          onChange={(e) => setNextNumber(e.target.value)} />
        <div><Button size="sm" onClick={save} loading={saving}>Save Numbering</Button></div>
      </div>
    </Card>
  );
}

const EMPTY_FORM = {
  name: "", companyName: "", kraPin: "", vatNumber: "",
  address: "", phone: "", email: "",
  invoiceFormat: "", invoiceNextNumber: "",
  bankName: "", bankAccountName: "", bankAccountNumber: "", bankBranch: "",
  mpesaPaybill: "", mpesaAccountNumber: "", mpesaTill: "", paymentInstructions: "",
};

export default function PaymentAccountsPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<PaymentAccount[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const load = useCallback(() => {
    fetch("/api/payment-accounts?includeInactive=true")
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setLogoUrl(null);
    setModalOpen(true);
  }

  function openEdit(a: PaymentAccount) {
    setEditing(a);
    setLogoUrl(a.logoUrl ?? null);
    setForm({
      name: a.name,
      companyName: a.companyName ?? "", kraPin: a.kraPin ?? "", vatNumber: a.vatNumber ?? "",
      address: a.address ?? "", phone: a.phone ?? "", email: a.email ?? "",
      invoiceFormat: a.invoiceFormat ?? "", invoiceNextNumber: String(a.invoiceNextNumber ?? 1),
      bankName: a.bankName ?? "", bankAccountName: a.bankAccountName ?? "",
      bankAccountNumber: a.bankAccountNumber ?? "", bankBranch: a.bankBranch ?? "",
      mpesaPaybill: a.mpesaPaybill ?? "", mpesaAccountNumber: a.mpesaAccountNumber ?? "",
      mpesaTill: a.mpesaTill ?? "", paymentInstructions: a.paymentInstructions ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Account name is required"); return; }
    setSaving(true);
    try {
      const { invoiceNextNumber, ...textForm } = form;
      const body: Record<string, unknown> = Object.fromEntries(
        Object.entries(textForm).map(([k, v]) => [k, k === "name" ? v.trim() : v.trim() || null]),
      );
      // Numbering counter is a number; only send it when provided and valid.
      const nextNum = parseInt(invoiceNextNumber, 10);
      if (!isNaN(nextNum) && nextNum >= 1) body.invoiceNextNumber = nextNum;
      const res = await fetch(editing ? `/api/payment-accounts/${editing.id}` : "/api/payment-accounts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to save");
      }
      toast.success(editing ? "Account updated" : "Account created");
      invalidatePaymentAccountCache();
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file || !editing) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/payment-accounts/${editing.id}/logo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Upload failed");
      setLogoUrl(data.logoUrl);
      invalidatePaymentAccountCache();
      toast.success("Logo uploaded");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoRemove() {
    if (!editing) return;
    setLogoUploading(true);
    try {
      const res = await fetch(`/api/payment-accounts/${editing.id}/logo`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setLogoUrl(null);
      invalidatePaymentAccountCache();
      toast.success("Logo removed");
      load();
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setLogoUploading(false);
    }
  }

  async function toggleActive(a: PaymentAccount) {
    try {
      const res = await fetch(`/api/payment-accounts/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      if (!res.ok) throw new Error();
      invalidatePaymentAccountCache();
      toast.success(a.isActive ? "Account deactivated" : "Account reactivated");
      load();
    } catch {
      toast.error("Failed to update account");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payment-accounts/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "Failed to delete");
      }
      invalidatePaymentAccountCache();
      toast.success("Account deleted");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <Header title="Payment Accounts" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role}>
        <Button size="sm" variant="gold" onClick={openAdd}><Plus size={14} /> Add Account</Button>
      </Header>

      <div className="page-container space-y-4">
        <p className="text-sm text-gray-500 font-sans">
          Named bank / M-Pesa destinations shown on tenant invoices. Pick a property&apos;s default on its
          Management Agreement page; override individual units on the unit itself.
        </p>

        {session?.user?.organizationId && <OrgNumberingCard orgId={session.user.organizationId} />}

        {accounts === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No payment accounts yet"
            description="Create an account to show its bank / M-Pesa details on tenant invoices"
            icon={<CreditCard size={40} />}
            action={<Button variant="gold" size="sm" onClick={openAdd}><Plus size={14} /> Add Account</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((a) => {
              const linked = a._count.agreements + a._count.units;
              return (
                <Card key={a.id} padding="sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.logoUrl} alt="" className="h-6 max-w-[60px] object-contain" />
                        )}
                        <p className="text-sm font-sans font-semibold text-header truncate">{a.name}</p>
                        {!a.isActive && <Badge variant="gray">Inactive</Badge>}
                      </div>
                      <div className="text-xs text-gray-500 font-sans mt-1.5 space-y-0.5">
                        {a.companyName && (
                          <p className="text-gray-600">
                            Invoiced as <span className="font-medium">{a.companyName}</span>
                            {a.kraPin ? ` · PIN ${a.kraPin}` : ""}{a.vatNumber ? ` · VAT ${a.vatNumber}` : ""}
                          </p>
                        )}
                        {a.invoiceFormat && (
                          <p className="text-gray-600">
                            Own invoice series: <span className="font-mono">{a.invoiceFormat}</span> · next {String(a.invoiceNextNumber).padStart(4, "0")}
                          </p>
                        )}
                        {a.bankName && (
                          <p>{a.bankName}{a.bankAccountNumber ? ` · ${a.bankAccountNumber}` : ""}{a.bankBranch ? ` · ${a.bankBranch}` : ""}</p>
                        )}
                        {a.mpesaPaybill && <p>M-Pesa Paybill {a.mpesaPaybill}{a.mpesaAccountNumber ? ` · A/C ${a.mpesaAccountNumber}` : ""}</p>}
                        {a.mpesaTill && <p>M-Pesa Till {a.mpesaTill}</p>}
                        {!a.bankName && !a.mpesaPaybill && !a.mpesaTill && <p className="text-gray-400">No details captured yet</p>}
                      </div>
                      <p className="text-[11px] text-gray-400 font-sans mt-1.5">
                        {linked === 0 ? "Not assigned yet" : `Used by ${a._count.agreements} propert${a._count.agreements === 1 ? "y" : "ies"} · ${a._count.units} unit${a._count.units === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(a)} title="Edit" className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleActive(a)} title={a.isActive ? "Deactivate" : "Reactivate"} className="p-1.5 rounded-lg text-gray-400 hover:text-header hover:bg-gray-100 transition-colors">
                        {a.isActive ? <ToggleRight size={16} className="text-income" /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(a)}
                        title={linked > 0 ? "In use — deactivate instead" : "Delete"}
                        disabled={linked > 0}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-expense hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Payment Account" : "New Payment Account"}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Account Name" placeholder="e.g. KCB — Main Collections" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div>
            <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoicing Identity</p>
            <p className="text-[11px] text-gray-400 font-sans mb-2">
              Optional — fill these when invoices paid to this account are issued by a different company.
              They override the invoice header (name, logo, tax numbers).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Company / Billing Name" placeholder="e.g. Shah Properties Ltd" value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
              <Input label="PIN No." placeholder="e.g. P051234567X" value={form.kraPin}
                onChange={(e) => setForm((f) => ({ ...f, kraPin: e.target.value }))} />
              <Input label="VAT No." placeholder="e.g. 0123456A" value={form.vatNumber}
                onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))} />
              <Input label="Address" placeholder="e.g. P.O. Box 100-00100, Nairobi" value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              <Input label="Phone" placeholder="e.g. +254 700 000 000" value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <Input label="Email" type="email" placeholder="e.g. accounts@company.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="mt-3">
              <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice Numbering</p>
              <p className="text-[11px] text-gray-400 font-sans mb-2">
                Leave blank to use the organisation&apos;s numbering. Set a format to run this company&apos;s own
                series — tokens: <code>{"{YYYY}"}</code> <code>{"{YY}"}</code> <code>{"{MM}"}</code> <code>{"{SEQ}"}</code>,
                e.g. <code>SHAH-{"{YYYY}"}-{"{SEQ}"}</code> → SHAH-2026-0014.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Number Format" placeholder="e.g. SHAH-{YYYY}-{SEQ}" value={form.invoiceFormat}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceFormat: e.target.value }))} />
                <Input label="Next Number" type="number" min="1" step="1" placeholder="1" value={form.invoiceNextNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNextNumber: e.target.value }))} />
              </div>
            </div>
            {editing ? (
              <div className="mt-3 flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Account logo" className="h-10 max-w-[120px] object-contain rounded border border-gray-100 bg-white p-1" />
                ) : (
                  <span className="text-xs text-gray-400 font-sans">No logo</span>
                )}
                <label className="text-xs font-sans font-medium text-gold hover:text-gold-dark cursor-pointer">
                  {logoUploading ? "Uploading…" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                    disabled={logoUploading} onChange={(e) => handleLogoUpload(e.target.files?.[0])} />
                </label>
                {logoUrl && (
                  <button type="button" onClick={handleLogoRemove} disabled={logoUploading}
                    className="text-xs font-sans text-gray-400 hover:text-expense transition-colors">
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 font-sans mt-2">Create the account first, then upload its logo.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-2">Bank Transfer</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bank Name" placeholder="e.g. Equity Bank" value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
              <Input label="Account Name" placeholder="e.g. Farasi Gardens Ltd" value={form.bankAccountName} onChange={(e) => setForm((f) => ({ ...f, bankAccountName: e.target.value }))} />
              <Input label="Account Number" placeholder="e.g. 0123456789" value={form.bankAccountNumber} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} />
              <Input label="Branch" placeholder="e.g. Westlands" value={form.bankBranch} onChange={(e) => setForm((f) => ({ ...f, bankBranch: e.target.value }))} />
            </div>
          </div>
          <div>
            <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-2">M-Pesa</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Paybill Number" placeholder="e.g. 522522" value={form.mpesaPaybill} onChange={(e) => setForm((f) => ({ ...f, mpesaPaybill: e.target.value }))} />
              <Input label="Account No (for Paybill)" placeholder="e.g. unit number" value={form.mpesaAccountNumber} onChange={(e) => setForm((f) => ({ ...f, mpesaAccountNumber: e.target.value }))} />
              <Input label="Till Number" placeholder="e.g. 123456" value={form.mpesaTill} onChange={(e) => setForm((f) => ({ ...f, mpesaTill: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-600 font-sans">Payment Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} placeholder="e.g. Use your unit number as the payment reference."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-cream/50 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold resize-none"
              value={form.paymentInstructions} onChange={(e) => setForm((f) => ({ ...f, paymentInstructions: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={saving}>{editing ? "Save Changes" : "Create Account"}</Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.name}?`}
        message="This payment account will be permanently deleted. Accounts in use by a property or unit cannot be deleted — deactivate them instead."
        loading={deleting}
      />
    </div>
  );
}
