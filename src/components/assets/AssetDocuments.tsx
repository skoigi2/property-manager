"use client";
import { forwardRef } from "react";
import { EntityDocuments, type EntityDocument, type EntityDocumentsHandle, type BadgeVariant } from "@/components/documents/EntityDocuments";
import { ASSET_DOCUMENT_CATEGORIES } from "@/lib/asset-documents";

export type AssetDocument = EntityDocument & { assetId: string };
export type AssetDocumentsHandle = EntityDocumentsHandle;

const CATEGORY_BADGE: Record<string, BadgeVariant> = {
  WARRANTY: "gold",
  MANUAL: "blue",
  INVOICE_RECEIPT: "gray",
  SERVICE_REPORT: "green",
  CERTIFICATE: "amber",
  PHOTO: "gray",
  OTHER: "gray",
};

const endpoint = (id: string) => `/api/assets/${id}/documents`;

interface Props {
  assetId?: string;
  onChanged?: (docs: AssetDocument[]) => void;
}

/** Asset-register flavour of the shared document uploader. */
export const AssetDocuments = forwardRef<AssetDocumentsHandle, Props>(function AssetDocuments({ assetId, onChanged }, ref) {
  return (
    <EntityDocuments
      ref={ref}
      endpoint={endpoint}
      categories={ASSET_DOCUMENT_CATEGORIES}
      categoryBadge={CATEGORY_BADGE}
      defaultCategory="WARRANTY"
      recordId={assetId}
      onChanged={onChanged as ((docs: EntityDocument[]) => void) | undefined}
      emptyText="No documents on this asset yet."
    />
  );
});
