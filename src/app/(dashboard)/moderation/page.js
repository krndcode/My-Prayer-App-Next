import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import ModerationWorkspace from "@/features/moderation/ModerationWorkspace";

export default async function ModerationPage() {
  const user = await getSessionUser();
  if (!user?.moderator) redirect("/prayer");
  return <ModerationWorkspace />;
}
