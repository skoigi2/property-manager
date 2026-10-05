"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { InspectionWalkthrough } from "@/components/inspections/InspectionWalkthrough";
import { InspectionReview } from "@/components/inspections/InspectionReview";
import type { InspectionDto } from "@/components/inspections/types";
import { canEditObservations } from "@/lib/inspection-rules";
import { ChevronLeft, ClipboardCheck } from "lucide-react";

// One inspection: the walkthrough while it's being filled in, the review
// once it's handed in (findings locked).
export default function InspectionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const orgRole = (session?.user as { orgRole?: string } | undefined)?.orgRole;
  const [inspection, setInspection] = useState<InspectionDto | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/condition-reports/${id}`);
    if (!res.ok) { setMissing(true); return; }
    setInspection(await res.json());
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Header title="Inspection" userName={session?.user?.name ?? session?.user?.email} role={orgRole} />
      <div className="page-container space-y-3 pb-24 lg:pb-8 max-w-3xl">
        <Link href="/inspections" className="inline-flex items-center gap-1 text-caption text-gray-500 hover:text-gold-dark">
          <ChevronLeft size={14} /> All inspections
        </Link>
        {missing ? (
          <EmptyState icon={<ClipboardCheck size={40} />} title="Inspection not found" description="It may have been deleted, or it's on a property you can't access." />
        ) : !inspection ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : canEditObservations(inspection.status) ? (
          // Remount when the server state changes status, so the walkthrough starts from the saved copy.
          <InspectionWalkthrough key={`${inspection.id}-${inspection.status}`} inspection={inspection} onChanged={setInspection} />
        ) : (
          <InspectionReview key={`${inspection.id}-${inspection.status}-${inspection.editRequestedAt ?? ""}`} inspection={inspection} onChanged={setInspection} />
        )}
      </div>
    </div>
  );
}
