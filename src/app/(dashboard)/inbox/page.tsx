import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InboxClient } from "./InboxClient";

export default async function InboxPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "OWNER") redirect("/report");

  return <InboxClient userName={session.user.name} role={session.user.role} />;
}
