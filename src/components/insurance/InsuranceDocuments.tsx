"use client";
import { forwardRef } from "react";
import { EntityDocuments, type EntityDocument, type EntityDocumentsHandle, type BadgeVariant } from "@/components/documents/EntityDocuments";
import { INSURANCE_DOCUMENT_CATEGORIES } from "@/lib/insurance-documents";

export type PolicyDocument = EntityDocument & { policyId: string };
export type InsuranceDocumentsHandle = EntityDocumentsHandle;

const CATEGORY_BADGE: Record<string, BadgeVariant> = {
  POLICY_SCHEDULE: "blue",
  CERTIFICATE: "green",
  VALUATION_REPORT: "gold",
  INSURER_ASSESSMENT: "amber",
  CLAIM: "red",
  INVOICE_RECEIPT: "gray",
  OTHER: "gray",
};

const endpoint = (id: string) => `/api/insurance/${id}/documents`;

interface Props {
  policyId?: string;
  onChanged?: (docs: PolicyDocument[]) => void;
}

/** Insurance-policy flavour of the shared document uploader. */
export const InsuranceDocuments = forwardRef<InsuranceDocumentsHandle, Props>(function InsuranceDocuments({ policyId, onChanged }, ref) {
  return (
    <EntityDocuments
      ref={ref}
      endpoint={endpoint}
      categories={INSURANCE_DOCUMENT_CATEGORIES}
      categoryBadge={CATEGORY_BADGE}
      defaultCategory="POLICY_SCHEDULE"
      recordId={policyId}
      onChanged={onChanged as ((docs: EntityDocument[]) => void) | undefined}
      emptyText="No documents on this policy yet."
    />
  );
});
