"use client";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { CheckoutForm } from "@/components/tenants/CheckoutForm";
import { ChevronLeft } from "lucide-react";

export default function TenantCheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tenantId = params.id;

  return (
    <>
      <Header title="Tenant Check-Out" />
      <div className="page-container">
        <button
          onClick={() => router.push(`/tenants/${tenantId}`)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gold mb-3 font-sans"
        >
          <ChevronLeft size={14} /> Back to tenant
        </button>
        <h1 className="font-display text-2xl text-header mb-1">Tenant Check-Out</h1>
        <p className="text-sm text-gray-500 font-sans mb-5">
          Settle the deposit, record condition and key returns, and generate the signed PDF statement.
        </p>
        <CheckoutForm tenantId={tenantId} />
      </div>
    </>
  );
}
