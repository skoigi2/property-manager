"use client";

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { TenantInput } from "@/lib/validations";

/**
 * The tenant add/edit field set, shared by the Tenants list modal and the
 * tenant detail page's Edit modal so the two can't drift apart. The parent
 * owns the react-hook-form instance and the submit/cancel buttons.
 */
export function TenantFormFields({
  register,
  control,
  errors,
  unitOptions,
  unitLabel = "Unit",
}: {
  register: UseFormRegister<TenantInput>;
  control: Control<TenantInput>;
  errors: FieldErrors<TenantInput>;
  unitOptions: { value: string; label: string }[];
  unitLabel?: string;
}) {
  const contacts = useFieldArray({ control, name: "additionalContacts" });

  return (
    <>
      <Input label="Tenant Name" {...register("name")} error={errors.name?.message} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Email" type="email" placeholder="tenant@example.com" {...register("email")} error={errors.email?.message} />
        <Input label="Phone" type="tel" placeholder="+1 555 000 0000" {...register("phone")} />
      </div>

      {/* Additional contacts — spouse, accounts office, guarantor… */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-body font-medium text-gray-600 ">
            Additional contacts <span className="text-gray-400 ">(optional)</span>
          </label>
          <button
            type="button"
            onClick={() => contacts.append({ label: "", email: "", phone: "" })}
            className="flex items-center gap-1 text-caption font-medium text-gold hover:text-gold-dark transition-colors"
          >
            <Plus size={13} /> Add contact
          </button>
        </div>
        {contacts.fields.length > 0 && (
          <div className="space-y-2">
            {contacts.fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="grid grid-cols-3 gap-2 flex-1">
                  <Input placeholder="Label (e.g. Spouse)" {...register(`additionalContacts.${i}.label`)} />
                  <Input type="email" placeholder="Email" {...register(`additionalContacts.${i}.email`)} error={errors.additionalContacts?.[i]?.email?.message} />
                  <Input type="tel" placeholder="Phone" {...register(`additionalContacts.${i}.phone`)} />
                </div>
                <button
                  type="button"
                  onClick={() => contacts.remove(i)}
                  aria-label="Remove contact"
                  className="p-2 mt-0.5 rounded-lg text-gray-300 hover:text-expense hover:bg-red-50 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Select
        label={unitLabel}
        placeholder="Select unit..."
        {...register("unitId")}
        options={unitOptions}
        error={errors.unitId?.message}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Monthly Rent" tooltip="The base rent amount, not including service charge. This is what's tracked in your rent roll and invoices." type="number" {...register("monthlyRent")} error={errors.monthlyRent?.message} />
        <Input label="Deposit" tooltip="Security held against potential damage or unpaid rent. Not counted as income — it's returned at lease end minus any deductions." type="number" {...register("depositAmount")} error={errors.depositAmount?.message} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Escalation Rate (%)" tooltip="Rent increase applied at each escalation, as a percentage. Used to project future rent in the forecast. Leave blank if rent is flat." type="number" step="0.1" {...register("escalationRate")} />
        <Input
          label="Escalation Every (years)"
          tooltip="How often the escalation applies — 1 for annual, 2 for every two years, or any custom interval."
          type="number" min="1" step="1" placeholder="1 = annual"
          {...register("escalationIntervalYears")}
          error={errors.escalationIntervalYears?.message}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Service Charge" tooltip="Shared building costs passed to the tenant — utilities, cleaning, maintenance. Keep separate from rent for clear reporting." type="number" {...register("serviceCharge")} />
        <Input label="Parking Fee" tooltip="Monthly parking line on the lease, billed alongside rent. Leave blank if not applicable." type="number" {...register("parkingFee")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Payment Frequency"
          tooltip="How often the tenant pays — most common is Monthly. Quarterly / Bi-annual / Annual leases pay rent in advance for that period. Also shown on invoices."
          placeholder="— Select cadence —"
          {...register("paymentFrequency")}
          options={[
            { value: "MONTHLY",   label: "Monthly" },
            { value: "QUARTERLY", label: "Quarterly" },
            { value: "BIANNUAL",  label: "Bi-annual" },
            { value: "ANNUAL",    label: "Annual" },
          ]}
        />
        <Input
          label="P.O. Box / Postal Address"
          tooltip="Used when issuing formal letters to the tenant — rent demands, notices, renewal offers."
          placeholder="P.O. Box 12345-00100, Nairobi"
          {...register("poBox")}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Lease Start" type="date" {...register("leaseStart")} error={errors.leaseStart?.message} />
        <Input label="Lease End" tooltip="Leave blank if the end date isn't agreed yet. The tenant will show as 'Lease TBC' until a date is set." type="date" {...register("leaseEnd")} />
      </div>
      <p className="text-caption text-gray-400 ">Leave Lease End blank to mark as TBC</p>
      <div className="flex flex-col gap-1">
        <label className="text-body font-medium text-gray-600 ">Notes</label>
        <textarea
          rows={3}
          placeholder="Any lease detail not captured in the structured fields — special clauses, banking notes, status caveats…"
          className="w-full border border-gray-200 rounded-lg text-body px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50"
          {...register("notes")}
        />
      </div>
    </>
  );
}

/** Drop blank contact rows before submitting (all three fields empty). */
export function cleanAdditionalContacts(data: TenantInput): TenantInput {
  const kept = (data.additionalContacts ?? []).filter(
    (c) => (c.label?.trim() || c.email?.trim() || c.phone?.trim()),
  );
  return { ...data, additionalContacts: kept.length > 0 ? kept : undefined };
}
