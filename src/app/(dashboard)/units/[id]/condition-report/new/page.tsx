import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAccessiblePropertyIds, requireManager } from "@/lib/auth-utils";
import { Header } from "@/components/layout/Header";
import { MoveInWalkthrough } from "@/components/condition-reports/MoveInWalkthrough";

export const dynamic = "force-dynamic";

export default async function NewConditionReportPage({ params }: { params: { id: string } }) {
  const { error } = await requireManager();
  if (error) redirect("/login");

  const propertyIds = await getAccessiblePropertyIds();
  if (!propertyIds) redirect("/login");

  const unit = await prisma.unit.findFirst({
    where: { id: params.id, propertyId: { in: propertyIds } },
    include: {
      property: { select: { id: true, name: true } },
      tenants: {
        where: { isActive: true },
        select: { id: true, name: true },
        take: 1,
      },
    },
  });

  if (!unit) {
    return (
      <>
        <Header title="Condition Report" />
        <div className="page-container">
          <p className="text-sm text-gray-400 font-sans text-center py-10">Unit not found.</p>
        </div>
      </>
    );
  }

  const activeTenant = unit.tenants[0] ?? null;

  return (
    <>
      <Header title="Condition Report" />
      <div className="page-container">
        <h1 className="font-display text-2xl text-header mb-1">New Condition Report</h1>
        <p className="text-sm text-gray-500 font-sans mb-5">
          Walk through each room, rate each feature, and capture photos. The report is saved as you go and a signed PDF is filed in the tenant&apos;s document vault when you submit.
        </p>
        <MoveInWalkthrough
          unit={{
            id: unit.id,
            unitNumber: unit.unitNumber,
            type: unit.type,
            property: { id: unit.property.id, name: unit.property.name },
            activeTenant: activeTenant ? { id: activeTenant.id, name: activeTenant.name } : null,
          }}
          defaultReportType={activeTenant ? "MOVE_IN" : "MID_TERM"}
        />
      </div>
    </>
  );
}
