import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardShell email={user.email} isModerator={user.moderator === true}>{children}</DashboardShell>;
}
