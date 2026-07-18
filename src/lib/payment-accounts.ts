import { z } from "zod";

// Shared by POST /api/payment-accounts and PATCH /api/payment-accounts/[id]
// (route files must not export extra symbols).
export const paymentAccountSchema = z.object({
  name:                z.string().min(1, "Account name is required"),
  // Invoicing identity overrides (logoUrl is set via the dedicated upload route)
  companyName:         z.string().optional().nullable(),
  kraPin:              z.string().optional().nullable(),
  vatNumber:           z.string().optional().nullable(),
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
