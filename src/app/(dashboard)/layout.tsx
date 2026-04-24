import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { PropertyProvider } from "@/lib/property-context";
import { TrialBanner } from "@/components/layout/TrialBanner";
import { InviteBanner } from "@/components/layout/InviteBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  const organizationId = session.user.organizationId ?? null;

  return (
    <PropertyProvider>
      <div className="flex min-h-screen bg-cream">
        <Sidebar role={role} organizationId={organizationId} />
        <div className="flex-1 flex flex-col min-w-0">
          {organizationId && <TrialBanner />}
          <InviteBanner />
          <main className="flex-1 pb-20 lg:pb-0 overflow-x-hidden">
            {children}
          </main>
        </div>
        <MobileNav role={role} />
      </div>
    </PropertyProvider>
  );
}
