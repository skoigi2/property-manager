"use client";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { NotificationPrefsPanel } from "@/components/settings/NotificationPrefsPanel";

export default function NotificationsSettingsPage() {
  const { data: session } = useSession();
  return (
    <div>
      <Header title="Notifications" userName={session?.user?.name ?? session?.user?.email} role={session?.user?.role} />
      <div className="page-container space-y-5">
        <NotificationPrefsPanel />
      </div>
    </div>
  );
}
