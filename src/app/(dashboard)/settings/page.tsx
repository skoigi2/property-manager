"use client";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { Settings, Save, Upload, Trash2, Building2 } from "lucide-react";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { TaxConfigPanel } from "@/components/settings/TaxConfigPanel";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"fees" | "info" | "branding" | "tax">("fees");
  const [feeForm, setFeeForm] = useState<Record<string, { ratePercent: string; flatAmount: string }>>({});

  // Branding state
  const [org, setOrg] = useState<any>(null);
  const [orgForm, setOrgForm] = useState({ name: "", address: "", phone: "", email: "", website: "" });
  const [paymentForm, setPaymentForm] = useState({
    vatRegistrationNumber: "",
    bankName: "", bankAccountName: "", bankAccountNumber: "", bankBranch: "",
    mpesaPaybill: "", mpesaAccountNumber: "", mpesaTill: "",
    paymentInstructions: "",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Property logo state
  const [propLogoUploading, setPropLogoUploading] = useState<string | null>(null);
  const propLogoInputRef = useRef<HTMLInputElement>(null);
  const [propLogoTarget, setPropLogoTarget] = useState<string | null>(null);

  // Per-property currency state: { [propertyId]: currencyCode }
  const [currencyForm, setCurrencyForm] = useState<Record<string, string>>({});
  const [currencySaving, setCurrencySaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setData(d);
      setLoading(false);
      const form: Record<string, any> = {};
      d.units?.forEach((unit: any) => {
        const latest = d.feeConfigs?.filter((c: any) => c.unitId === unit.id)
          .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
        form[unit.id] = { ratePercent: String(latest?.ratePercent ?? 0), flatAmount: String(latest?.flatAmount ?? "") };
      });
      setFeeForm(form);
      // Init currency form from property data
      const cform: Record<string, string> = {};
      d.properties?.forEach((p: any) => { cform[p.id] = p.currency ?? "USD"; });
      setCurrencyForm(cform);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "branding") fetchOrg();
  }, [tab]);

  async function fetchOrg() {
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const orgs = await res.json();
        const o = orgs[0] ?? null;
        setOrg(o);
        if (o) {
          setOrgForm({ name: o.name ?? "", address: o.address ?? "", phone: o.phone ?? "", email: o.email ?? "", website: o.website ?? "" });
          setPaymentForm({
            vatRegistrationNumber: o.vatRegistrationNumber ?? "",
            bankName: o.bankName ?? "", bankAccountName: o.bankAccountName ?? "",
            bankAccountNumber: o.bankAccountNumber ?? "", bankBranch: o.bankBranch ?? "",
            mpesaPaybill: o.mpesaPaybill ?? "", mpesaAccountNumber: o.mpesaAccountNumber ?? "",
            mpesaTill: o.mpesaTill ?? "", paymentInstructions: o.paymentInstructions ?? "",
          });
        }
      }
    } catch { /* ignore */ }
  }

  async function saveFeeConfig(unitId: string) {
    setSaving(true);
    try {
      const { ratePercent, flatAmount } = feeForm[unitId] ?? {};
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, ratePercent, flatAmount: flatAmount || null, effectiveFrom: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Fee config updated");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }

  async function savePaymentDetails() {
    if (!org) return;
    setPaymentSaving(true);
    try {
      const body: Record<string, string | null> = {};
      (Object.keys(paymentForm) as (keyof typeof paymentForm)[]).forEach((k) => {
        body[k] = paymentForm[k].trim() || null;
      });
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Payment details updated");
      fetchOrg();
    } catch { toast.error("Failed to save payment details"); }
    finally { setPaymentSaving(false); }
  }

  async function saveBranding() {
    if (!org) return;
    setBrandingSaving(true);
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgForm),
      });
      if (!res.ok) throw new Error();
      toast.success("Branding updated");
      fetchOrg();
    } catch { toast.error("Failed to save branding"); }
    finally { setBrandingSaving(false); }
  }

  async function uploadOrgLogo(file: File) {
    if (!org) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/organizations/${org.id}/logo`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      toast.success("Logo uploaded");
      fetchOrg();
    } catch { toast.error("Failed to upload logo"); }
    finally { setLogoUploading(false); }
  }

  async function removeOrgLogo() {
    if (!org) return;
    setLogoUploading(true);
    try {
      await fetch(`/api/organizations/${org.id}/logo`, { method: "DELETE" });
      toast.success("Logo removed");
      fetchOrg();
    } catch { toast.error("Failed to remove logo"); }
    finally { setLogoUploading(false); }
  }

  async function uploadPropertyLogo(propertyId: string, file: File) {
    setPropLogoUploading(propertyId);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/properties/${propertyId}/logo`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      toast.success("Property logo uploaded");
      // Refresh data to show new logo
      const d = await fetch("/api/settings").then((r) => r.json());
      setData(d);
    } catch { toast.error("Failed to upload property logo"); }
    finally { setPropLogoUploading(null); }
  }

  async function savePropertyCurrency(propertyId: string) {
    setCurrencySaving(propertyId);
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: currencyForm[propertyId] ?? "USD" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Currency updated");
    } catch { toast.error("Failed to save currency"); }
    finally { setCurrencySaving(null); }
  }

  async function removePropertyLogo(propertyId: string) {
    setPropLogoUploading(propertyId);
    try {
      await fetch(`/api/properties/${propertyId}/logo`, { method: "DELETE" });
      toast.success("Property logo removed");
      const d = await fetch("/api/settings").then((r) => r.json());
      setData(d);
    } catch { toast.error("Failed to remove logo"); }
    finally { setPropLogoUploading(null); }
  }

  const tabs = [
    { key: "fees",     label: "Management Fees" },
    { key: "branding", label: "Branding" },
    { key: "info",     label: "Property Info" },
    { key: "tax",      label: "Tax" },
  ];

  return (
    <div>
      <Header title="Settings" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        <div className="flex gap-2 border-b border-gray-200">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2.5 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? "border-gold text-header" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : !data ? <p className="text-gray-400 text-center py-8 font-sans">Failed to load settings</p> : (
          <>
            {/* ── Management Fees ── */}
            {tab === "fees" && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 font-sans">Update management fee rates per unit. Changes take effect immediately for future calculations.</p>
                {data.units?.map((unit: any) => {
                  const form = feeForm[unit.id] ?? { ratePercent: "0", flatAmount: "" };
                  const isAlba = unit.property?.type === "AIRBNB";
                  return (
                    <Card key={unit.id}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="font-sans font-semibold text-header">{unit.unitNumber}</p>
                          <p className="text-xs text-gray-400 font-sans">{unit.property?.name} · {unit.type === "ONE_BED" ? "1 Bed" : "2 Bed"}</p>
                        </div>
                        {isAlba ? <span className="text-xs font-sans bg-gold/10 text-gold-dark px-2 py-1 rounded-full">% Rate</span> : <span className="text-xs font-sans bg-blue-50 text-blue-600 px-2 py-1 rounded-full">Flat Fee</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {isAlba ? (
                          <Input label="Rate (%)" type="number" step="0.1" value={form.ratePercent} onChange={(e) => setFeeForm((prev) => ({ ...prev, [unit.id]: { ...form, ratePercent: e.target.value } }))} />
                        ) : (
                          <Input label="Flat Fee" type="number" value={form.flatAmount} onChange={(e) => setFeeForm((prev) => ({ ...prev, [unit.id]: { ...form, flatAmount: e.target.value } }))} />
                        )}
                      </div>
                      <Button size="sm" variant="secondary" loading={saving} onClick={() => saveFeeConfig(unit.id)}><Save size={14} /> Save</Button>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ── Branding ── */}
            {tab === "branding" && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500 font-sans">
                  Your company branding appears on all invoices and reports. Upload a logo and fill in your contact details.
                </p>

                {!org ? (
                  <p className="text-sm text-gray-400 font-sans text-center py-8">No organisation found.</p>
                ) : (
                  <>
                    {/* Company logo */}
                    <Card>
                      <h3 className="font-sans font-semibold text-header mb-4 flex items-center gap-2">
                        <Building2 size={16} className="text-gold" /> Company Logo
                      </h3>
                      <div className="flex items-start gap-6">
                        {/* Logo preview */}
                        <div className="w-32 h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden shrink-0">
                          {org.logoUrl ? (
                            <img src={org.logoUrl} alt="Company logo" className="w-full h-full object-contain p-2" />
                          ) : (
                            <p className="text-xs text-gray-400 font-sans text-center px-2">No logo yet</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 font-sans">Recommended: PNG or SVG, max 2 MB. Logo appears in PDF invoice headers. If no property logo is set, this is used as the fallback.</p>
                          <div className="flex gap-2 flex-wrap">
                            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOrgLogo(f); e.target.value = ""; }} />
                            <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-white text-xs font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors">
                              {logoUploading ? <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> : <Upload size={12} />}
                              {org.logoUrl ? "Replace" : "Upload"} logo
                            </button>
                            {org.logoUrl && (
                              <button onClick={removeOrgLogo} disabled={logoUploading}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-expense hover:border-expense text-xs font-sans rounded-lg disabled:opacity-50 transition-colors">
                                <Trash2 size={12} /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Company details */}
                    <Card>
                      <h3 className="font-sans font-semibold text-header mb-4 flex items-center gap-2">
                        <Settings size={16} className="text-gold" /> Company Details
                      </h3>
                      <div className="space-y-4">
                        <Input label="Company Name" value={orgForm.name}
                          onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-4">
                          <Input label="Phone" value={orgForm.phone}
                            onChange={(e) => setOrgForm((p) => ({ ...p, phone: e.target.value }))} />
                          <Input label="Email" type="email" value={orgForm.email}
                            onChange={(e) => setOrgForm((p) => ({ ...p, email: e.target.value }))} />
                        </div>
                        <Input label="Address" value={orgForm.address}
                          onChange={(e) => setOrgForm((p) => ({ ...p, address: e.target.value }))} />
                        <Input label="Website" value={orgForm.website}
                          onChange={(e) => setOrgForm((p) => ({ ...p, website: e.target.value }))} />
                        <Button loading={brandingSaving} onClick={saveBranding}><Save size={14} /> Save details</Button>
                      </div>
                    </Card>

                    {/* Payment Details */}
                    <Card>
                      <h3 className="font-sans font-semibold text-header mb-1 flex items-center gap-2">
                        <Save size={16} className="text-gold" /> Payment Details
                      </h3>
                      <p className="text-xs text-gray-500 font-sans mb-4">
                        These details appear on all invoices so tenants know exactly how to pay. At minimum, fill in either Bank or M-Pesa details.
                      </p>
                      <div className="space-y-4">
                        <Input label="KRA PIN / VAT Registration Number" value={paymentForm.vatRegistrationNumber}
                          onChange={(e) => setPaymentForm((p) => ({ ...p, vatRegistrationNumber: e.target.value }))}
                          placeholder="e.g. P051234567X" />

                        <div className="border-t border-gray-100 pt-4">
                          <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">Bank Transfer</p>
                          <div className="grid grid-cols-2 gap-4">
                            <Input label="Bank Name" value={paymentForm.bankName}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, bankName: e.target.value }))}
                              placeholder="e.g. Equity Bank" />
                            <Input label="Account Name" value={paymentForm.bankAccountName}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, bankAccountName: e.target.value }))}
                              placeholder="e.g. Acme Properties Ltd" />
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <Input label="Account Number" value={paymentForm.bankAccountNumber}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, bankAccountNumber: e.target.value }))}
                              placeholder="e.g. 0123456789" />
                            <Input label="Branch (optional)" value={paymentForm.bankBranch}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, bankBranch: e.target.value }))}
                              placeholder="e.g. Westlands" />
                          </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                          <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-3">M-Pesa</p>
                          <div className="grid grid-cols-2 gap-4">
                            <Input label="Paybill Number" value={paymentForm.mpesaPaybill}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, mpesaPaybill: e.target.value }))}
                              placeholder="e.g. 522522" />
                            <Input label="Account Number (for Paybill)" value={paymentForm.mpesaAccountNumber}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, mpesaAccountNumber: e.target.value }))}
                              placeholder="e.g. tenant unit number" />
                          </div>
                          <div className="mt-4">
                            <Input label="Till Number (alternative to Paybill)" value={paymentForm.mpesaTill}
                              onChange={(e) => setPaymentForm((p) => ({ ...p, mpesaTill: e.target.value }))}
                              placeholder="e.g. 123456" />
                          </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                          <label className="block text-xs font-sans font-medium text-gray-500 mb-1.5">
                            Additional Payment Instructions (optional)
                          </label>
                          <textarea
                            value={paymentForm.paymentInstructions}
                            onChange={(e) => setPaymentForm((p) => ({ ...p, paymentInstructions: e.target.value }))}
                            placeholder="e.g. Please use your unit number as the payment reference."
                            rows={3}
                            className="w-full text-sm font-sans border border-gray-200 rounded-xl px-3 py-2.5 text-header placeholder:text-gray-300 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 resize-none"
                          />
                        </div>

                        <Button loading={paymentSaving} onClick={savePaymentDetails}><Save size={14} /> Save payment details</Button>
                      </div>
                    </Card>

                    {/* Per-property currency */}
                    <Card>
                      <h3 className="font-sans font-semibold text-header mb-1 flex items-center gap-2">
                        <Building2 size={16} className="text-gold" /> Property Currency
                      </h3>
                      <p className="text-xs text-gray-500 font-sans mb-4">
                        Set the display currency for each property. Used on all financial displays, reports, and invoices.
                      </p>
                      <div className="space-y-3">
                        {data.properties?.map((property: any) => (
                          <div key={property.id} className="flex items-center gap-4 p-3 bg-cream rounded-xl">
                            <div className="flex-1">
                              <p className="font-sans font-medium text-sm text-header">{property.name}</p>
                              <p className="text-xs text-gray-400 font-sans">{property.type === "AIRBNB" ? "Short-let" : "Long-term"}</p>
                            </div>
                            <select
                              value={currencyForm[property.id] ?? "USD"}
                              onChange={(e) => setCurrencyForm((prev) => ({ ...prev, [property.id]: e.target.value }))}
                              className="text-sm font-sans border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-header focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30"
                            >
                              {SUPPORTED_CURRENCIES.map((c) => (
                                <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => savePropertyCurrency(property.id)}
                              disabled={currencySaving === property.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-gold text-white text-xs font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors"
                            >
                              {currencySaving === property.id ? <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> : <Save size={11} />}
                              Save
                            </button>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* Per-property logos */}
                    <Card>
                      <h3 className="font-sans font-semibold text-header mb-1 flex items-center gap-2">
                        <Building2 size={16} className="text-gold" /> Property Logos
                      </h3>
                      <p className="text-xs text-gray-500 font-sans mb-4">
                        Optional — overrides the company logo on invoices for that specific property.
                      </p>
                      <input ref={propLogoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden" onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f && propLogoTarget) uploadPropertyLogo(propLogoTarget, f);
                          e.target.value = "";
                        }} />
                      <div className="space-y-3">
                        {data.properties?.map((property: any) => (
                          <div key={property.id} className="flex items-center gap-4 p-3 bg-cream rounded-xl">
                            <div className="w-20 h-14 border border-gray-200 rounded-lg flex items-center justify-center bg-white overflow-hidden shrink-0">
                              {property.logoUrl ? (
                                <img src={property.logoUrl} alt={property.name} className="w-full h-full object-contain p-1.5" />
                              ) : (
                                <p className="text-xs text-gray-300 font-sans">None</p>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-sans font-medium text-sm text-header">{property.name}</p>
                              <p className="text-xs text-gray-400 font-sans">{property.type === "AIRBNB" ? "Short-let" : "Long-term"}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setPropLogoTarget(property.id); propLogoInputRef.current?.click(); }}
                                disabled={propLogoUploading === property.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-gold text-white text-xs font-sans rounded-lg hover:bg-gold-dark disabled:opacity-50 transition-colors">
                                {propLogoUploading === property.id ? <span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> : <Upload size={11} />}
                                {property.logoUrl ? "Replace" : "Upload"}
                              </button>
                              {property.logoUrl && (
                                <button onClick={() => removePropertyLogo(property.id)}
                                  disabled={propLogoUploading === property.id}
                                  className="p-1.5 text-gray-400 hover:text-expense border border-gray-200 rounded-lg disabled:opacity-50 transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}

            {/* ── Tax ── */}
            {tab === "tax" && (
              <div className="space-y-6">
                {/* Org-level defaults */}
                {session?.user?.organizationId && (
                  <div>
                    <h3 className="font-display text-sm text-header mb-1">Organisation Defaults</h3>
                    <TaxConfigPanel
                      orgId={session.user.organizationId}
                      propertyId={null}
                    />
                  </div>
                )}
                {/* Per-property overrides */}
                {data.properties?.map((property: any) => (
                  <div key={property.id}>
                    <h3 className="font-display text-sm text-header mb-1">{property.name}</h3>
                    <TaxConfigPanel
                      orgId={property.organizationId ?? session?.user?.organizationId ?? ""}
                      propertyId={property.id}
                      currency={property.currency}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── Property Info ── */}
            {tab === "info" && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 font-sans">Property and unit overview</p>
                {data.properties?.map((property: any) => {
                  const units = data.units?.filter((u: any) => u.propertyId === property.id) ?? [];
                  return (
                    <Card key={property.id}>
                      <h3 className="font-display text-base text-header mb-1">{property.name}</h3>
                      <p className="text-xs text-gray-400 font-sans mb-3">{property.type === "AIRBNB" ? "Short-let / Airbnb" : "Long-term Tenanted"} · {units.length} units</p>
                      <div className="space-y-1">
                        {units.map((u: any) => (
                          <div key={u.id} className="flex items-center justify-between py-2 border-t border-gray-50">
                            <div>
                              <span className="font-mono text-sm text-header">{u.unitNumber}</span>
                              <span className="text-xs text-gray-400 font-sans ml-2">{u.type === "ONE_BED" ? "1 Bed" : "2 Bed"}</span>
                            </div>
                            {u.monthlyRent && <CurrencyDisplay amount={u.monthlyRent} size="sm" />}
                            <span className={`text-xs font-sans px-2 py-0.5 rounded-full ${u.status === "ACTIVE" ? "bg-green-100 text-green-700" : u.status === "VACANT" ? "bg-gray-100 text-gray-500" : "bg-yellow-100 text-yellow-700"}`}>{u.status}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
