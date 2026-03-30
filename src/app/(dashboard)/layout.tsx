import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { PropertyProvider } from "@/lib/property-context";

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
          <main className="flex-1 pb-20 lg:pb-0">
            {children}
          </main>
        </div>
        <MobileNav role={role} />
      </div>
    </PropertyProvider>
  );
}
