"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { HelpTip } from "@/components/ui/HelpTip";
import { DEFAULT_UNIT_LABEL, METER_ROLE_LABEL, UTILITY_LABEL, resolveTariffForPeriod, type MeterRole, type UtilityType } from "@/lib/utility-billing";
import { readError, type MeterDto, type TariffDto } from "./types";

interface UnitOption { id: string; unitNumber: string }
interface SettingRow { utility: UtilityType; unitLabel: string; holdInvoicesForReadings: boolean; requirePhoto: boolean }

interface Props {
  propertyId: string;
  currency: string;
  /** ADMIN / MANAGER set rates and settings; an accountant only reads them. */
  canEditRates: boolean;
  onChanged: () => void;
}

const UTILITIES: UtilityType[] = ["WATER", "ELECTRICITY"];

export function MetersTariffsTab({ propertyId, currency, canEditRates, onChanged }: Props) {
  const [meters, setMeters] = useState<MeterDto[]>([]);
  const [tariffs, setTariffs] = useState<TariffDto[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [meterModal, setMeterModal] = useState<{ utility: UtilityType; meter?: MeterDto } | null>(null);
  const [tariffModal, setTariffModal] = useState<UtilityType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t, s, p] = await Promise.all([
        fetch(`/api/utilities/meters?propertyId=${propertyId}&includeInactive=true`),
        fetch(`/api/utilities/tariffs?propertyId=${propertyId}`),
        fetch(`/api/utilities/settings?propertyId=${propertyId}`),
        fetch(`/api/properties`),
      ]);
      if (!m.ok || !t.ok || !s.ok) throw new Error();
      setMeters(await m.json());
      setTariffs(await t.json());
      setSettings(await s.json());
      if (p.ok) {
        const props: { id: string; units?: UnitOption[] }[] = await p.json();
        setUnits(props.find((x) => x.id === propertyId)?.units ?? []);
      }
    } catch {
      toast.error("Failed to load meters and rates");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged(); };

  async function bulkCreate(utility: UtilityType) {
    const res = await fetch("/api/utilities/meters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: true, propertyId, utility, label: UTILITY_LABEL[utility] }),
    });
    if (!res.ok) return toast.error(await readError(res, "Could not create the meters."));
    const body: { created: number; skipped: number } = await res.json();
    toast.success(body.created ? `${body.created} meter${body.created === 1 ? "" : "s"} created` : "Every unit already has one");
    changed();
  }

  async function saveSetting(utility: UtilityType, patch: Partial<SettingRow>) {
    const res = await fetch("/api/utilities/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, utility, ...patch }),
    });
    if (!res.ok) return toast.error(await readError(res, "Could not save the setting."));
    setSettings((rows) => rows.map((r) => (r.utility === utility ? { ...r, ...patch } : r)));
    onChanged();
  }

  async function deleteTariff(t: TariffDto) {
    const res = await fetch(`/api/utilities/tariffs/${t.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(await readError(res, "Could not remove the rate."));
    toast.success("Rate removed");
    changed();
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const now = new Date();

  return (
    <div className="space-y-6">
      {UTILITIES.map((utility) => {
        const list = meters.filter((m) => m.utility === utility);
        const history = tariffs.filter((t) => t.utility === utility);
        const setting = settings.find((s) => s.utility === utility);
        const unitLabel = setting?.unitLabel ?? DEFAULT_UNIT_LABEL[utility];
        const current = resolveTariffForPeriod(
          history.map((t) => ({ ...t, effectiveFrom: new Date(t.effectiveFrom) })),
          now.getFullYear(),
          now.getMonth() + 1,
        );
        return (
          <Card key={utility}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-h2 text-gray-900">{UTILITY_LABEL[utility]}</h2>
                <p className="text-body text-gray-600 mt-1">
                  {current ? (
                    <>
                      Tenants pay{" "}
                      <span className="font-medium text-gray-900 tabular-nums">
                        {currency} {(current.supplyRate + current.fuelRate).toLocaleString()}
                      </span>{" "}
                      per {unitLabel === "units" ? "unit" : unitLabel}
                      {utility === "ELECTRICITY" && current.fuelRate > 0 && (
                        <span className="text-gray-500"> ({current.supplyRate.toLocaleString()} power + {current.fuelRate.toLocaleString()} generator fuel)</span>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-700">No rate set — readings can&apos;t be priced until you add one.</span>
                  )}
                </p>
              </div>
              {canEditRates && (
                <Button size="sm" onClick={() => setTariffModal(utility)}>
                  <Plus size={14} className="mr-1" /> {current ? "Change rate" : "Set rate"}
                </Button>
              )}
            </div>

            {history.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-body">
                  <thead className="text-label uppercase text-gray-400">
                    <tr>
                      <th className="text-left py-1.5 pr-3">From</th>
                      <th className="text-right py-1.5 px-3">{utility === "ELECTRICITY" ? "Power rate" : "Rate"}</th>
                      {utility === "ELECTRICITY" && <th className="text-right py-1.5 px-3">Fuel rate</th>}
                      <th className="text-right py-1.5 px-3">Tenant pays</th>
                      <th className="text-left py-1.5 px-3">Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map((t) => (
                      <tr key={t.id}>
                        <td className="py-1.5 pr-3 text-gray-700">
                          {new Date(t.effectiveFrom).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" })}
                          {current?.id === t.id && <Badge variant="green" className="ml-2">Current</Badge>}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{t.supplyRate.toLocaleString()}</td>
                        {utility === "ELECTRICITY" && <td className="py-1.5 px-3 text-right tabular-nums">{t.fuelRate.toLocaleString()}</td>}
                        <td className="py-1.5 px-3 text-right tabular-nums font-medium text-gray-900">{(t.supplyRate + t.fuelRate).toLocaleString()}</td>
                        <td className="py-1.5 px-3 text-caption text-gray-500">{t.notes ?? ""}</td>
                        <td className="py-1.5 text-right">
                          {canEditRates && (
                            <button type="button" onClick={() => deleteTariff(t)} className="p-1 text-gray-300 hover:text-expense" aria-label="Remove rate">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {setting && (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body text-gray-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={setting.requirePhoto} disabled={!canEditRates} onChange={(e) => saveSetting(utility, { requirePhoto: e.target.checked })} />
                  <span className="flex items-center gap-1.5">Caretaker must attach a photo <HelpTip text="The caretaker can't submit a reading without a photo of the meter. Managers entering readings are not restricted." /></span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={setting.holdInvoicesForReadings} disabled={!canEditRates} onChange={(e) => saveSetting(utility, { holdInvoicesForReadings: e.target.checked })} />
                  <span className="flex items-center gap-1.5">Hold automatic rent invoices until readings are approved <HelpTip text="When automatic invoice generation is on, metered units wait until the 5th of the month for last month's readings to be approved, so the bill goes out together with the rent. After the 5th the rent invoice is sent anyway." /></span>
                </label>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-h3 text-gray-900">Meters <span className="text-caption font-normal text-gray-400">({list.filter((m) => m.isActive).length} active)</span></h3>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => bulkCreate(utility)} disabled={units.length === 0}>
                  One per unit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setMeterModal({ utility })}>
                  <Plus size={14} className="mr-1" /> Add meter
                </Button>
              </div>
            </div>

            {list.length === 0 ? (
              <p className="mt-2 text-body text-gray-500">
                No {UTILITY_LABEL[utility].toLowerCase()} meters yet. &ldquo;One per unit&rdquo; creates a meter for every unit
                {utility === "ELECTRICITY" ? "; then add the bulk supply meter and the common-area meter" : ""}.
              </p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((m) => (
                  <div key={m.id} className={`flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 ${m.isActive ? "" : "opacity-50"}`}>
                    <div className="min-w-0">
                      <p className="text-body font-medium text-gray-900 truncate">
                        {m.role === "UNIT" && m.unitNumber ? `Unit ${m.unitNumber} · ` : ""}{m.label}
                      </p>
                      <p className="text-caption text-gray-500 truncate">
                        {m.role !== "UNIT" ? `${METER_ROLE_LABEL[m.role]} · not billed` : m.ratePerUnitOverride != null ? `Own rate ${m.ratePerUnitOverride.toLocaleString()}` : "Property rate"}
                        {m.meterNumber ? ` · No. ${m.meterNumber}` : ""}
                        {!m.isActive ? " · inactive" : ""}
                      </p>
                    </div>
                    <button type="button" onClick={() => setMeterModal({ utility, meter: m })} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label={`Edit ${m.label}`}>
                      <Pencil size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {meterModal && (
        <MeterModal
          propertyId={propertyId}
          utility={meterModal.utility}
          meter={meterModal.meter}
          units={units}
          onClose={() => setMeterModal(null)}
          onSaved={() => { setMeterModal(null); changed(); }}
        />
      )}
      {tariffModal && (
        <TariffModal
          propertyId={propertyId}
          utility={tariffModal}
          currency={currency}
          onClose={() => setTariffModal(null)}
          onSaved={() => { setTariffModal(null); changed(); }}
        />
      )}
    </div>
  );
}

function MeterModal({
  propertyId, utility, meter, units, onClose, onSaved,
}: { propertyId: string; utility: UtilityType; meter?: MeterDto; units: UnitOption[]; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<MeterRole>(meter?.role ?? "UNIT");
  const [unitId, setUnitId] = useState(meter?.unitId ?? "");
  const [label, setLabel] = useState(meter?.label ?? UTILITY_LABEL[utility]);
  const [meterNumber, setMeterNumber] = useState(meter?.meterNumber ?? "");
  const [opening, setOpening] = useState(String(meter?.openingReading ?? 0));
  const [override, setOverride] = useState(meter?.ratePerUnitOverride != null ? String(meter.ratePerUnitOverride) : "");
  const [isActive, setIsActive] = useState(meter?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const roleOptions = useMemo(
    () => [
      { value: "UNIT", label: "Unit meter — billed to the tenant" },
      { value: "COMMON", label: "Common areas — not billed" },
      { value: "BULK", label: utility === "ELECTRICITY" ? "Bulk supply meter (KPLC) — not billed" : "Bulk supply meter (council) — not billed" },
    ],
    [utility],
  );

  function onRole(next: MeterRole) {
    setRole(next);
    if (!meter) {
      setLabel(next === "UNIT" ? UTILITY_LABEL[utility] : next === "COMMON" ? "Common areas" : utility === "ELECTRICITY" ? "KPLC bulk meter" : "Council supply meter");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const shared = {
        label,
        meterNumber: meterNumber || null,
        openingReading: Number(opening) || 0,
        ratePerUnitOverride: role === "UNIT" && override.trim() !== "" ? Number(override) : null,
      };
      const res = meter
        ? await fetch(`/api/utilities/meters/${meter.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...shared,
              isActive,
              ...(meter.readingsCount > 0 ? { openingReading: undefined } : {}),
            }),
          })
        : await fetch("/api/utilities/meters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId, utility, role, unitId: role === "UNIT" ? unitId : null, ...shared }),
          });
      if (!res.ok) {
        toast.error(await readError(res, "Could not save the meter."));
        return;
      }
      toast.success(meter ? "Meter saved" : "Meter added");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!meter) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/utilities/meters/${meter.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readError(res, "Could not delete the meter."));
        return;
      }
      toast.success("Meter deleted");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={meter ? `Edit meter — ${meter.label}` : `Add ${UTILITY_LABEL[utility].toLowerCase()} meter`}>
      <div className="space-y-4">
        {!meter && (
          <Select label="What does it measure?" value={role} onChange={(e) => onRole(e.target.value as MeterRole)} options={roleOptions} />
        )}
        {!meter && role === "UNIT" && (
          <Select
            label="Unit"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="Pick a unit"
            options={units.map((u) => ({ value: u.id, label: u.unitNumber }))}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={label} onChange={(e) => setLabel(e.target.value)} tooltip="Shown on the tenant's invoice, e.g. Water, Hot water, Electricity." />
          <Input label="Meter number" value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} placeholder="Optional" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Opening reading"
            type="number"
            step="any"
            min={0}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            disabled={!!meter && meter.readingsCount > 0}
            tooltip="What the meter showed when you started tracking it. The first month's consumption is measured from here."
          />
          {role === "UNIT" && (
            <Input
              label="Own rate per unit"
              type="number"
              step="any"
              min={0}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="Uses the property rate"
              tooltip="Leave empty to charge the property rate. Set it for a meter billed differently, e.g. hot water."
            />
          )}
        </div>
        {meter && (
          <label className="flex items-center gap-2 text-body text-gray-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active — appears on the monthly reading sheet
          </label>
        )}
        <div className="flex items-center justify-between gap-2">
          {meter && meter.readingsCount === 0 ? (
            <Button variant="danger" size="sm" onClick={remove} disabled={saving}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!label.trim() || (!meter && role === "UNIT" && !unitId)}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TariffModal({
  propertyId, utility, currency, onClose, onSaved,
}: { propertyId: string; utility: UtilityType; currency: string; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [supplyRate, setSupplyRate] = useState("");
  const [fuelRate, setFuelRate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const total = (Number(supplyRate) || 0) + (utility === "ELECTRICITY" ? Number(fuelRate) || 0 : 0);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/utilities/tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          utility,
          effectiveFrom: `${month}-01T00:00:00.000Z`,
          supplyRate: Number(supplyRate),
          fuelRate: utility === "ELECTRICITY" ? Number(fuelRate) || 0 : 0,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not save the rate."));
        return;
      }
      toast.success("Rate saved");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${UTILITY_LABEL[utility]} rate`}>
      <div className="space-y-4">
        <Input
          label="Applies from"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          tooltip="The rate applies to readings of this month onwards, until you add a newer one. Readings already approved keep the rate they were approved at."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={utility === "ELECTRICITY" ? "Power rate per kWh" : "Rate per unit"}
            type="number"
            step="any"
            min={0}
            prefix={currency}
            value={supplyRate}
            onChange={(e) => setSupplyRate(e.target.value)}
            tooltip={utility === "ELECTRICITY" ? "The Kenya Power domestic consumer rate you charge tenants per kWh." : "What tenants pay per unit of water, e.g. 150."}
          />
          {utility === "ELECTRICITY" && (
            <Input
              label="Generator fuel rate per kWh"
              type="number"
              step="any"
              min={0}
              prefix={currency}
              value={fuelRate}
              onChange={(e) => setFuelRate(e.target.value)}
              placeholder="0"
              tooltip="Optional. Added on top of the power rate to recover backup-generator fuel. Leave at 0 to charge the power rate only."
            />
          )}
        </div>
        <p className="text-body text-gray-600">
          Tenants pay <span className="font-medium text-gray-900 tabular-nums">{currency} {total.toLocaleString()}</span> per {utility === "ELECTRICITY" ? "kWh" : "unit"}.
        </p>
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — e.g. KPLC tariff review, Oct 2026" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!(Number(supplyRate) > 0) || !month}>Save rate</Button>
        </div>
      </div>
    </Modal>
  );
}
