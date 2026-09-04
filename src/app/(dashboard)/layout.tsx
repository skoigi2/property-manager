import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { PropertyProvider } from "@/lib/property-context";
import { TrialBanner } from "@/components/layout/TrialBanner";
import { InviteBanner } from "@/components/layout/InviteBanner";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { OPS_ROLES } from "@/lib/auth-utils";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  // Navigation is keyed on the ACTIVE ORG's membership role, never the global
  // User.role (which the invitation flow never writes). Super-admin has no
  // membership, so orgRole falls back to the global ADMIN.
  const role = session.user.orgRole ?? session.user.role;
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
        {/* Cmd/Ctrl+K palette — ops staff incl. CARETAKER (per-group scoping in the API); never OWNER */}
        {(OPS_ROLES as readonly string[]).includes(role) && <GlobalSearch />}
      </div>
    </PropertyProvider>
  );
}
