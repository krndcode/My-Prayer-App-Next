"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getFirebaseDb } from "@/lib/firebase";
import { GroupRoom } from "@/features/prayer/PrayerWorkspace";
import { LoadingState, Notice } from "@/components/ui/DashboardPrimitives";

const db = getFirebaseDb();

export default function GroupChatPage({ groupId }) {
  const router = useRouter();
  const { user, loading: authLoading } = useCurrentUser();
  const [group, setGroup] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !groupId) return undefined;
    let groupLoaded = false;
    let membershipLoaded = false;
    const finishLoading = () => {
      if (groupLoaded && membershipLoaded) setLoading(false);
    };
    const stopGroup = onSnapshot(
      doc(db, "prayerGroups", groupId),
      (snapshot) => {
        setGroup(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        groupLoaded = true;
        finishLoading();
      },
      (snapshotError) => {
        setError(snapshotError.message || "This prayer group could not be loaded.");
        groupLoaded = true;
        finishLoading();
      }
    );
    const stopMembership = onSnapshot(
      doc(db, "prayerGroups", groupId, "members", user.uid),
      (snapshot) => {
        setIsMember(snapshot.exists());
        membershipLoaded = true;
        finishLoading();
      },
      (snapshotError) => {
        setError(snapshotError.message || "Your group membership could not be checked.");
        membershipLoaded = true;
        finishLoading();
      }
    );
    return () => {
      stopGroup();
      stopMembership();
    };
  }, [groupId, user]);

  async function removeMember(member) {
    if (!user || !group) return;
    const groupRef = doc(db, "prayerGroups", group.id);
    const membershipRef = doc(db, "prayerGroups", group.id, "members", member.uid);
    await runTransaction(db, async (transaction) => {
      const [groupSnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(membershipRef)
      ]);
      if (!groupSnapshot.exists() || !membershipSnapshot.exists()) return;
      if (groupSnapshot.data().creatorUid !== user.uid || membershipSnapshot.data().role !== "member") {
        throw new Error("Only the group administrator can remove a regular member.");
      }
      transaction.delete(membershipRef);
      transaction.update(groupRef, {
        memberCount: Math.max(0, (groupSnapshot.data().memberCount || 1) - 1),
        updatedAt: serverTimestamp()
      });
    });
  }

  async function leaveGroup() {
    if (!user || !group) return;
    const groupRef = doc(db, "prayerGroups", group.id);
    const membershipRef = doc(db, "prayerGroups", group.id, "members", user.uid);
    await runTransaction(db, async (transaction) => {
      const [groupSnapshot, membershipSnapshot] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(membershipRef)
      ]);
      if (!groupSnapshot.exists() || !membershipSnapshot.exists()) return;
      if (membershipSnapshot.data().role === "admin") {
        throw new Error("Group administrators can't leave. Delete the group or transfer administration first.");
      }
      transaction.delete(membershipRef);
      transaction.update(groupRef, {
        memberCount: Math.max(0, (groupSnapshot.data().memberCount || 1) - 1),
        updatedAt: serverTimestamp()
      });
    });
    router.replace("/prayer");
  }

  async function deleteGroup(confirmation) {
    const response = await fetch(`/api/prayer-groups/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The group could not be deleted.");
    router.replace("/prayer");
  }

  if (authLoading || loading) return <LoadingState label="Opening your prayer room…" />;
  if (error) return <Notice>{error}</Notice>;
  if (!group) return <Notice>This prayer group no longer exists.</Notice>;
  if (!user || !isMember) {
    return (
      <div className="space-y-4">
        <Notice>You must be a member of this prayer group to open its chat.</Notice>
        <button type="button" onClick={() => router.replace("/prayer")} className="text-sm font-semibold text-teal-800 hover:underline">
          Back to prayer groups
        </button>
      </div>
    );
  }

  return (
    <GroupRoom
      key={group.id}
      group={group}
      user={user}
      isAdmin={group.creatorUid === user.uid}
      onLeave={leaveGroup}
      onRemoveMember={removeMember}
      onDeleteGroup={deleteGroup}
      onClose={() => router.push("/prayer")}
    />
  );
}
