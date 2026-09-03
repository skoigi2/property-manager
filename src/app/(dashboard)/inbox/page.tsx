import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InboxClient } from "./InboxClient";

export default async function InboxPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const orgRole = session.user.orgRole ?? session.user.role;
  if (orgRole === "OWNER") redirect("/report");
  if (orgRole === "CARETAKER") redirect("/maintenance");

  return <InboxClient userName={session.user.name} role={orgRole} />;
}
