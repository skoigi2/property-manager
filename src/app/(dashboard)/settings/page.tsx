"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { CurrencyDisplay } from "@/components/ui/CurrencyDisplay";
import { formatDate } from "@/lib/date-utils";
import { Settings, Save } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"fees" | "info">("fees");
  const [feeForm, setFeeForm] = useState<Record<string, { ratePercent: string; flatAmount: string }>>({});

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setData(d);
      setLoading(false);
      // Pre-fill fee form with latest config per unit
      const form: Record<string, any> = {};
      d.units?.forEach((unit: any) => {
        const latest = d.feeConfigs?.filter((c: any) => c.unitId === unit.id).sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
        form[unit.id] = { ratePercent: String(latest?.ratePercent ?? 0), flatAmount: String(latest?.flatAmount ?? "") };
      });
      setFeeForm(form);
    }).catch(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <Header title="Settings" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        <div className="flex gap-2 border-b border-gray-200">
          {[{ key: "fees", label: "Management Fees" }, { key: "info", label: "Property Info" }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2.5 text-sm font-sans font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? "border-gold text-header" : "border-transparent text-gray-400 hover:text-gray-600"}`}>{t.label}</button>
          ))}
        </div>

        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : !data ? <p className="text-gray-400 text-center py-8 font-sans">Failed to load settings</p> : (
          <>
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
                          <Input label="Flat Fee (KSh)" type="number" prefix="KSh" value={form.flatAmount} onChange={(e) => setFeeForm((prev) => ({ ...prev, [unit.id]: { ...form, flatAmount: e.target.value } }))} />
                        )}
                      </div>
                      <Button size="sm" variant="secondary" loading={saving} onClick={() => saveFeeConfig(unit.id)}><Save size={14} /> Save</Button>
                    </Card>
                  );
                })}
              </div>
            )}

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
