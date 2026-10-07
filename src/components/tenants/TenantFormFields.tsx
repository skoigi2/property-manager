"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { HelpTip } from "@/components/ui/HelpTip";
import { PaymentAccountSelect } from "@/components/ui/PaymentAccountSelect";
import type { TenantInput } from "@/lib/validations";

/** Per-unit payment-account state the form needs: the unit's own override
 *  and the property's default (what "inherit" resolves to). */
export type UnitAccountInfo = { override: string | null; propertyDefault: string | null };

/**
 * The tenant add/edit field set, shared by the Tenants list modal and the
 * tenant detail page's Edit modal so the two can't drift apart. The parent
 * owns the react-hook-form instance and the submit/cancel buttons.
 */
export function TenantFormFields({
  register,
  control,
  errors,
  setValue,
  unitOptions,
  unitAccounts,
  unitLabel = "Unit",
  isEditing = false,
}: {
  register: UseFormRegister<TenantInput>;
  control: Control<TenantInput>;
  errors: FieldErrors<TenantInput>;
  setValue?: UseFormSetValue<TenantInput>;
  unitOptions: { value: string; label: string }[];
  /** unitId → its payment-account override + property default. When
   *  provided, the Payment account dropdown is shown and follows the unit. */
  unitAccounts?: Record<string, UnitAccountInfo>;
  unitLabel?: string;
  /** Editing an existing account (not adding one). */
  isEditing?: boolean;
}) {
  const contacts = useFieldArray({ control, name: "additionalContacts" });
  const unitId = useWatch({ control, name: "unitId" });
  const escalationType = useWatch({ control, name: "escalationType" });
  // A unit owner pays only the service charge: no rent, deposit, lease end or rent reviews.
  const isOwner = !!useWatch({ control, name: "isUnitOwner" });
  const unitInfo = unitId && unitAccounts ? unitAccounts[unitId] : undefined;

  // The dropdown edits the UNIT's override, so when the unit changes the field
  // must show that unit's current setting — otherwise saving would silently
  // clear an override on a unit the manager never meant to touch.
  useEffect(() => {
    if (!setValue || !unitInfo) return;
    setValue("paymentAccountId", unitInfo.override);
  }, [unitId, unitInfo, setValue]);

  return (
    <>
      <Controller
        control={control}
        name="isUnitOwner"
        render={({ field }) => (
          <div>
            <span className="flex items-center gap-1.5 text-body font-medium text-gray-600 mb-1">
              <span>Account type</span>
              <HelpTip text="A unit owner owns their apartment on a development you manage and pays only the service charge (plus any metered utilities or Wi-Fi). Their payments are recorded as service charge, never rent, and there's no rent, deposit, lease end, rent review, renewal or letting fee." />
            </span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
              {[
                { value: false, label: "Tenant", hint: "Pays rent" },
                { value: true, label: "Unit owner", hint: "Service charge only" },
              ].map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  role="radio"
                  aria-checked={!!field.value === o.value}
                  onClick={() => {
                    // Turning an existing tenant into an owner removes their rent and rent history on save.
                    if (o.value && !field.value && isEditing && !window.confirm(
                      "Make this account a unit owner (service charge only)? Saving removes the rent, deposit, lease end and rent history. To record a tenant buying their unit, cancel, check the tenant out and add a new owner account instead.",
                    )) return;
                    field.onChange(o.value);
                    if (o.value && setValue) { setValue("monthlyRent", 0); setValue("depositAmount", 0); }
                  }}
                  className={`text-left border rounded-lg px-3 py-2 transition-colors ${!!field.value === o.value ? "border-gold bg-gold/10" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <span className="block text-body font-medium text-header">{o.label}</span>
                  <span className="block text-caption text-gray-500">{o.hint}</span>
                </button>
              ))}
            </div>
            {isEditing && field.value && (
              <p className="text-caption text-gray-500 mt-1">
                An owner account has no rent, deposit, lease end or rent history — saving removes them. To record a tenant buying their unit, check the tenant out and add a new owner account instead.
              </p>
            )}
          </div>
        )}
      />
      <Input label={isOwner ? "Owner Name" : "Tenant Name"} {...register("name")} error={errors.name?.message} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Email" type="email" placeholder="tenant@example.com" {...register("email")} error={errors.email?.message} />
        <Input
          label="Phone"
          type="tel"
          placeholder="+254 712 345 678"
          tooltip="Include the country code so WhatsApp reminders work. A number starting with 0 is read as the property's country."
          {...register("phone")}
        />
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
      {unitAccounts && (
        <div>
          <Controller
            control={control}
            name="paymentAccountId"
            render={({ field }) => (
              <PaymentAccountSelect
                label="Payment account for invoices"
                tooltip="The bank / M-Pesa details and PIN / VAT numbers printed on this tenant's invoices. Leave on the property default unless this unit is paid into a different account. Accounts are managed in Settings → Payment Accounts."
                value={field.value ?? null}
                onChange={field.onChange}
                inheritAccountId={unitInfo ? unitInfo.propertyDefault : undefined}
              />
            )}
          />
          <p className="text-caption text-gray-400 mt-1">
            Saved on the unit (same setting as the unit&apos;s edit form and the property page), so it also applies to the next tenant of this unit.
          </p>
        </div>
      )}
      {!isOwner && (<>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Monthly Rent" tooltip="The base rent amount, not including service charge. This is what's tracked in your rent roll and invoices." type="number" {...register("monthlyRent")} error={errors.monthlyRent?.message} />
        <Input label="Deposit" tooltip="Security held against potential damage or unpaid rent. Not counted as income — it's returned at lease end minus any deductions." type="number" {...register("depositAmount")} error={errors.depositAmount?.message} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Rent Increase"
          tooltip="How the lease's rent review raises the rent: by a percentage, or by a fixed amount each time. The app reminds you before each review and drafts the notice."
          options={[
            { value: "PERCENT", label: "Percentage" },
            { value: "FIXED_AMOUNT", label: "Fixed amount" },
          ]}
          {...register("escalationType")}
        />
        {escalationType === "FIXED_AMOUNT" ? (
          <Input label="Increase Amount" tooltip="Added to the monthly rent at each review. Leave blank if the rent is flat." type="number" min="0" {...register("escalationAmount")} error={errors.escalationAmount?.message} />
        ) : (
          <Input label="Escalation Rate (%)" tooltip="Rent increase at each review, as a percentage. Leave blank if the rent is flat." type="number" step="0.1" {...register("escalationRate")} />
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Every (years)"
          tooltip="How often the rent is reviewed — 1 for annual, 2 for every two years, or any custom interval."
          type="number" min="1" step="1" placeholder="1 = annual"
          {...register("escalationIntervalYears")}
          error={errors.escalationIntervalYears?.message}
        />
        <Input
          label="First Review"
          tooltip="Date of the first rent review. Leave blank to use the lease anniversary (lease start + one interval)."
          type="date"
          {...register("escalationAnchorDate")}
        />
        <Input
          label="Notice (days)"
          tooltip="Notice the lease requires before an increase. Leave blank to use the property default (Management Agreement, 90 days unless changed)."
          type="number" min="0" step="1" placeholder="Default"
          {...register("escalationNoticeDays")}
          error={errors.escalationNoticeDays?.message}
        />
      </div>
      </>)}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label={isOwner ? "Service Charge (monthly)" : "Service Charge"}
          tooltip={isOwner
            ? "What the owner pays each month towards the development's shared costs. The Service charge page can set it from the year's budget (Apply charge)."
            : "Shared building costs passed to the tenant — utilities, cleaning, maintenance. Keep separate from rent for clear reporting."}
          type="number"
          {...register("serviceCharge")}
        />
        <Input label="Parking Fee" tooltip="Monthly parking line on the lease, billed alongside rent. Leave blank if not applicable." type="number" {...register("parkingFee")} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Wi-Fi (monthly)" tooltip="Billed on each rent invoice as its own Wi-Fi line. Paid after rent, water and electricity, and kept out of the management-fee base like the other utilities. Leave 0 if the tenant isn't charged for Wi-Fi." type="number" min="0" {...register("wifiCharge")} />
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Emergency contact"
          tooltip="Who to call if something happens in the unit. Caretakers see it on the inspections they run."
          placeholder="Name"
          {...register("emergencyContactName")}
        />
        <Input label="Emergency phone" placeholder="+254 7…" {...register("emergencyContactPhone")} />
        <Input label="Relationship" placeholder="e.g. Spouse, brother" {...register("emergencyContactRelation")} />
      </div>
      {isOwner ? (
        <div className="grid grid-cols-2 gap-4">
          <Input label="Billing starts" tooltip="The first month the owner is billed the service charge (usually when you took over the development, or when they bought the unit)." type="date" {...register("leaseStart")} error={errors.leaseStart?.message} />
        </div>
      ) : (<>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Lease Start" type="date" {...register("leaseStart")} error={errors.leaseStart?.message} />
        <Input label="Lease End" tooltip="Leave blank if the end date isn't agreed yet. The tenant will show as 'Lease TBC' until a date is set." type="date" {...register("leaseEnd")} />
      </div>
      <p className="text-caption text-gray-400 ">Leave Lease End blank to mark as TBC</p>
      </>)}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" {...register("showVatOnInvoice")} className="mt-0.5 rounded border-gray-300 text-gold focus:ring-gold/30" />
        <span className="flex items-center gap-1.5 text-body text-gray-600">
          <span>Show the landlord&apos;s tax numbers (PIN / VAT) on this tenant&apos;s invoices</span>
          <HelpTip text="Prints the PIN No. and VAT No. from the payment account (or organisation) in the invoice header. Untick for tenants who should not see them. Payment details are unaffected." />
        </span>
      </label>
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
