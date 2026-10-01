import { dialCodeForCurrency, normalizePhoneForWhatsApp } from "@/lib/whatsapp";

/**
 * Can we reach this tenant at all? Email reminders, receipts and portal-reply
 * emails need an email address; WhatsApp needs a phone number that can be made
 * international (a local "07…" number only with a property currency that names
 * the country). A tenant with neither gets nothing the app sends. Pure,
 * client-safe — used by the Tenants list filter and the data-health check.
 */
export function tenantContactChannels(
  tenant: { email?: string | null; phone?: string | null },
  currency?: string | null,
): { email: boolean; whatsapp: boolean } {
  const email = !!tenant.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenant.email.trim());
  const whatsapp = normalizePhoneForWhatsApp(tenant.phone, dialCodeForCurrency(currency)) !== null;
  return { email, whatsapp };
}

export function isTenantUncontactable(
  tenant: { email?: string | null; phone?: string | null },
  currency?: string | null,
): boolean {
  const c = tenantContactChannels(tenant, currency);
  return !c.email && !c.whatsapp;
}
