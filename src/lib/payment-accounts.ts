import { z } from "zod";

// Shared by POST /api/payment-accounts and PATCH /api/payment-accounts/[id]
// (route files must not export extra symbols).
export const paymentAccountSchema = z.object({
  name:                z.string().min(1, "Account name is required"),
  // Invoicing identity overrides (logoUrl is set via the dedicated upload route)
  companyName:         z.string().optional().nullable(),
  kraPin:              z.string().optional().nullable(),
  vatNumber:           z.string().optional().nullable(),
  address:             z.string().optional().nullable(),
  phone:               z.string().optional().nullable(),
  email:               z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  // Per-company numbering series (format set = account runs its own series)
  invoiceFormat:       z.string().max(60).optional().nullable(),
  invoiceNextNumber:   z.coerce.number().int().min(1).optional(),
  bankName:            z.string().optional().nullable(),
  bankAccountName:     z.string().optional().nullable(),
  bankAccountNumber:   z.string().optional().nullable(),
  bankBranch:          z.string().optional().nullable(),
  mpesaPaybill:        z.string().optional().nullable(),
  mpesaAccountNumber:  z.string().optional().nullable(),
  mpesaTill:           z.string().optional().nullable(),
  paymentInstructions: z.string().optional().nullable(),
  isActive:            z.boolean().optional(),
});

export type PaymentAccountInput = z.infer<typeof paymentAccountSchema>;
