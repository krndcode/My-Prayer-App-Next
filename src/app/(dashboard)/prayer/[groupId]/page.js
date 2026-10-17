import GroupChatPage from "@/features/prayer/GroupChatPage";

export default async function PrayerGroupChatRoute({ params }) {
  const { groupId } = await params;
  return <GroupChatPage groupId={groupId} />;
}
