"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CallsWorkspace from "@/features/calls/CallsWorkspace";
import {
  EmptyState,
  Field,
  LoadingState,
  Notice,
  PageHeading,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextAreaField,
  formatDate
} from "@/components/ui/DashboardPrimitives";

const db = getFirebaseDb();

function getActionError(error) {
  if (error.code === "permission-denied") {
    return "You don't have permission to do that. Refresh the page and try again.";
  }
  if (error.code === "unavailable") {
    return "You're offline or the service is unavailable. Check your connection and try again.";
  }
  return error.message || "The change could not be saved. Please try again.";
}

export default function PrayerWorkspace() {
  const { user, loading: authLoading } = useCurrentUser();
  const router = useRouter();
  const [groups, setGroups] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!user) return undefined;

    const stopGroups = onSnapshot(
      query(
        collection(db, "prayerGroups"),
        where("visibility", "==", "public"),
        orderBy("updatedAt", "desc"),
        limit(50)
      ),
      (snapshot) => {
        setGroups(snapshot.docs.map((groupDoc) => ({ id: groupDoc.id, ...groupDoc.data() })));
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        setError(getActionError(snapshotError));
        setLoading(false);
      }
    );

    const stopMemberships = onSnapshot(
      query(collectionGroup(db, "members"), where("uid", "==", user.uid)),
      (snapshot) => {
        setGroupIds(
          snapshot.docs
            .map((membership) => membership.ref.parent.parent?.id)
            .filter(Boolean)
        );
      },
      (snapshotError) => setError(getActionError(snapshotError))
    );

    return () => {
      stopGroups();
      stopMemberships();
    };
  }, [user]);

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return groups;
    return groups.filter(
      (group) =>
        group.name?.toLocaleLowerCase().includes(needle) ||
        group.description?.toLocaleLowerCase().includes(needle)
    );
  }, [groups, search]);

  const myGroups = groups.filter((group) => groupIds.includes(group.id));

  async function createGroup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!user || !name) return;

    setError("");
    setNotice("");
    try {
      const groupRef = doc(collection(db, "prayerGroups"));
      const creatorMembershipRef = doc(db, "prayerGroups", groupRef.id, "members", user.uid);
      await runTransaction(db, async (transaction) => {
        transaction.set(groupRef, {
          name,
          description,
          creatorUid: user.uid,
          creatorName: user.displayName || user.email?.split("@")[0] || "Community member",
          visibility: "public",
          memberCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        transaction.set(creatorMembershipRef, {
          uid: user.uid,
          displayName: user.displayName || user.email?.split("@")[0] || "Community member",
          groupName: name,
          role: "admin",
          joinedAt: serverTimestamp()
        });
      });
      setShowCreate(false);
      setNotice("Your prayer group is ready. You're its administrator.");
      router.push(`/prayer/${groupRef.id}`);
      form.reset();
    } catch (createError) {
      setError(getActionError(createError));
    }
  }

  async function joinGroup(group) {
    if (!user) return;
    setError("");
    setNotice("");
    try {
      const groupRef = doc(db, "prayerGroups", group.id);
      const membershipRef = doc(db, "prayerGroups", group.id, "members", user.uid);
      await runTransaction(db, async (transaction) => {
        const [groupSnapshot, membershipSnapshot] = await Promise.all([
          transaction.get(groupRef),
          transaction.get(membershipRef)
        ]);
        if (!groupSnapshot.exists()) throw new Error("This group is no longer available.");
        if (membershipSnapshot.exists()) return;
        transaction.update(groupRef, {
          memberCount: (groupSnapshot.data().memberCount || 0) + 1,
          updatedAt: serverTimestamp()
        });
        transaction.set(membershipRef, {
          uid: user.uid,
          displayName: user.displayName || user.email?.split("@")[0] || "Community member",
          groupName: group.name,
          role: "member",
          joinedAt: serverTimestamp()
        });
      });
      router.push(`/prayer/${group.id}`);
      setNotice(`You joined ${group.name}.`);
    } catch (joinError) {
      setError(getActionError(joinError));
    }
  }

  if (authLoading || loading) return <LoadingState />;
  if (!user) return <Notice>Please sign in again to open your prayer community.</Notice>;

  return (
    <div>
      <PageHeading
        eyebrow="Prayer community"
        title="Pray together."
        description="Find a prayer group, share encouragement, and make room for one another."
        action={
          <PrimaryButton type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? "Close form" : "Create a group"}
          </PrimaryButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          {showCreate && (
            <Panel>
              <h2 className="text-lg font-semibold">Start a prayer group</h2>
              <p className="mt-1 text-sm text-slate-600">
                Every group is discoverable. Group conversations are only visible to members.
              </p>
              <form onSubmit={createGroup} className="mt-5 space-y-4">
                <Field id="group-name" name="name" label="Group name" required maxLength={80} />
                <TextAreaField
                  id="group-description"
                  name="description"
                  label="What will you pray about together?"
                  required
                  maxLength={500}
                  minLength={12}
                  rows={3}
                />
                <PrimaryButton type="submit">Create group</PrimaryButton>
              </form>
            </Panel>
          )}

          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Discover groups</h2>
                <p className="mt-1 text-sm text-slate-600">Join instantly. No approval needed.</p>
              </div>
              <label className="w-full sm:w-64">
                <span className="sr-only">Search groups</span>
                <input
                  aria-label="Search groups"
                  className="auth-input"
                  placeholder="Search prayer groups"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            {filteredGroups.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title={search ? "No groups match that search" : "Be the first to start a group"}
                  description={
                    search
                      ? "Try a different name or topic."
                      : "Create a public prayer group and invite others to pray with you."
                  }
                />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {filteredGroups.map((group) => {
                  const joined = groupIds.includes(group.id);
                  return (
                    <article
                      key={group.id}
                      className="rounded-xl border border-slate-200 p-4 transition hover:border-teal-200"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-slate-950">{group.name}</h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                            {group.description}
                          </p>
                          <p className="mt-3 text-xs text-slate-500">
                            Started by {group.creatorName || "a community member"} ·{" "}
                            {group.memberCount || 0} {group.memberCount === 1 ? "member" : "members"}
                          </p>
                        </div>
                        {joined ? (
                          <SecondaryButton
                            type="button"
                            onClick={() => router.push(`/prayer/${group.id}`)}
                            aria-label={`Open ${group.name} prayer room`}
                          >
                            Open room
                          </SecondaryButton>
                        ) : (
                          <PrimaryButton type="button" onClick={() => joinGroup(group)}>
                            Join group
                          </PrimaryButton>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">My groups</h2>
                <p className="mt-1 text-sm text-slate-600">Your prayer rooms and conversations.</p>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900">
                {myGroups.length}
              </span>
            </div>
            {myGroups.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title="Your groups will show up here"
                  description="Join a group to open its member-only prayer room."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {myGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => router.push(`/prayer/${group.id}`)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {group.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {group.memberCount || 0} members
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-teal-800">→</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

        </div>
      </div>

      {(error || notice) && (
        <div className="fixed bottom-24 right-4 z-40 w-[min(92vw,420px)] lg:bottom-6">
          <Notice tone={error ? "error" : "success"}>{error || notice}</Notice>
        </div>
      )}
    </div>
  );
}

export function GroupRoom({ group, user, isAdmin, onLeave, onRemoveMember, onClose, onDeleteGroup }) {
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [olderMessages, setOlderMessages] = useState([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [hasMessageCursor, setHasMessageCursor] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [callType, setCallType] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingGroup, setDeletingGroup] = useState(false);
  const oldestMessageRef = useRef(null);
  const hasLoadedOlderRef = useRef(false);
  const openIncomingCall = useCallback((type) => setCallType(type), []);

  async function handleLeaveGroup() {
    try {
      await onLeave();
    } catch (leaveError) {
      setError(getActionError(leaveError));
    }
  }

  async function handleRemoveMember(member) {
    try {
      await onRemoveMember(member);
    } catch (removeError) {
      setError(getActionError(removeError));
    }
  }

  useEffect(() => {
    const membersQuery = query(collection(db, "prayerGroups", group.id, "members"));
    const messagesQuery = query(
      collection(db, "prayerGroups", group.id, "messages"),
      orderBy("createdAt", "desc"),
      limit(40)
    );
    const stopMembers = onSnapshot(
      membersQuery,
      (snapshot) =>
        setMembers(snapshot.docs.map((member) => member.data()).sort((a, b) => a.joinedAt?.seconds - b.joinedAt?.seconds)),
      (snapshotError) => setError(getActionError(snapshotError))
    );
    const stopMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        if (!hasLoadedOlderRef.current) {
          oldestMessageRef.current = snapshot.docs[snapshot.docs.length - 1] || null;
        }
        setHasMessageCursor(snapshot.docs.length > 0);
        setMessages(snapshot.docs.map((message) => ({ id: message.id, ...message.data() })).reverse());
        if (snapshot.docs.length < 40) setHasOlderMessages(false);
      },
      (snapshotError) => setError(getActionError(snapshotError))
    );
    return () => {
      stopMembers();
      stopMessages();
    };
  }, [group.id]);

  async function loadOlderMessages() {
    if (!oldestMessageRef.current || loadingOlder || !hasOlderMessages) return;
    setLoadingOlder(true);
    setError("");
    hasLoadedOlderRef.current = true;
    try {
      const olderSnapshot = await getDocs(
        query(
          collection(db, "prayerGroups", group.id, "messages"),
          orderBy("createdAt", "desc"),
          startAfter(oldestMessageRef.current),
          limit(40)
        )
      );
      if (olderSnapshot.empty) {
        setHasOlderMessages(false);
        return;
      }
      oldestMessageRef.current = olderSnapshot.docs[olderSnapshot.docs.length - 1];
      setOlderMessages((current) => [
        ...current,
        ...olderSnapshot.docs.map((message) => ({ id: message.id, ...message.data() })).reverse()
      ]);
      setHasOlderMessages(olderSnapshot.docs.length === 40);
    } catch (loadError) {
      setError(getActionError(loadError));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 2000) return;
    setSending(true);
    setError("");
    try {
      await addDoc(collection(db, "prayerGroups", group.id, "messages"), {
        uid: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Community member",
        photoURL: user.photoURL || null,
        text,
        createdAt: serverTimestamp()
      });
      setDraft("");
    } catch (sendError) {
      setError(getActionError(sendError));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-[min(76vh,780px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_22px_60px_-40px_rgba(22,50,37,0.42)]">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Back to prayer groups" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6M9 12h11" /></svg>
          </button>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-900">
            {group.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-950 sm:text-base">{group.name}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{members.length} members · private group chat</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" title="Start an audio internet call" aria-label="Start an audio internet call" onClick={() => setCallType("audio")} className="grid h-10 w-10 place-items-center rounded-full text-teal-800 transition hover:bg-teal-50">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.2 3.5H5a2 2 0 0 0-2 2c0 8.6 7 15.5 15.5 15.5a2 2 0 0 0 2-2v-2.2l-4.6-2-1.8 2.2a14 14 0 0 1-7.1-7.1l2.2-1.8-2-4.6Z" /></svg>
          </button>
          <button type="button" title="Start a video internet call" aria-label="Start a video internet call" onClick={() => setCallType("video")} className="grid h-10 w-10 place-items-center rounded-full text-teal-800 transition hover:bg-teal-50">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
          </button>
          <details className="relative">
            <summary aria-label="Group information and settings" className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full text-slate-600 hover:bg-slate-100">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
            </summary>
            <div className="absolute right-0 top-12 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <p className="text-sm font-semibold text-slate-900">Group members ({members.length})</p>
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {members.map((member) => (
                  <div key={member.uid} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-700">
                      {member.uid === user.uid ? "You" : member.displayName || "Member"}
                      {member.role === "admin" && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Admin</span>}
                    </span>
                    {isAdmin && member.uid !== user.uid && member.role !== "admin" && (
                      <button type="button" onClick={() => handleRemoveMember(member)} className="shrink-0 text-xs font-medium text-red-700 hover:underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                {isAdmin ? (
                  <button type="button" onClick={() => setDeleteDialogOpen(true)} className="text-sm font-semibold text-red-700 hover:underline">Delete group</button>
                ) : (
                  <button type="button" onClick={handleLeaveGroup} className="text-sm font-semibold text-red-700 hover:underline">Leave group</button>
                )}
              </div>
            </div>
          </details>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#efeae2] px-3 py-5 sm:px-6" aria-live="polite">
        <p className="mx-auto mb-2 max-w-sm rounded-xl bg-[#fbf2d8] px-3 py-2 text-center text-[11px] leading-5 text-slate-600 shadow-sm">
          Messages in this prayer room are only visible to group members.
        </p>
        {hasOlderMessages && hasMessageCursor && (
          <div className="text-center">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="text-xs font-semibold text-teal-800 hover:underline disabled:opacity-60"
            >
              {loadingOlder ? "Loading older messages…" : "Load older messages"}
            </button>
          </div>
        )}
        {olderMessages.length + messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            This room is quiet for now. Share a prayer or a word of encouragement.
          </p>
        ) : (
          [...olderMessages, ...messages].map((message) => {
            const ownMessage = message.uid === user.uid;
            return (
              <article key={message.id} className={`flex w-full ${ownMessage ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[75%] ${ownMessage ? "rounded-br-md bg-[#d9fdd3]" : "rounded-bl-md bg-white"}`}>
                  {!ownMessage && <p className="mb-1 text-xs font-bold text-teal-800">{message.authorName || "Community member"}</p>}
                  <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">{message.text}</p>
                  <time className="mt-1 block text-right text-[10px] text-slate-500">{formatDate(message.createdAt)}</time>
                </div>
              </article>
            );
          })
        )}
      </div>
      <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-200 bg-[#f7f8f6] p-3 sm:px-5">
        <label htmlFor={`message-${group.id}`} className="sr-only">Write to {group.name}</label>
        <input
          id={`message-${group.id}`}
          className="auth-input min-w-0 flex-1 rounded-full bg-white"
          placeholder="Write a message…"
          maxLength={2000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <PrimaryButton type="submit" disabled={sending || !draft.trim()} className="min-h-11 w-11 shrink-0 rounded-full p-0" aria-label="Send message">
          {sending ? "…" : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>}
        </PrimaryButton>
      </form>
      {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (deleteConfirmation !== group.name || deletingGroup) return;
              setDeletingGroup(true);
              setError("");
              try {
                await onDeleteGroup(group.name);
              } catch (deleteError) {
                setError(getActionError(deleteError));
                setDeletingGroup(false);
              }
            }}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">Delete prayer group</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">This cannot be undone</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This permanently deletes <strong>{group.name}</strong>, its messages and member records, and associated schedules and call sessions. Type the group name to confirm.
            </p>
            <input className="auth-input mt-4" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} aria-label="Type group name to confirm deletion" autoComplete="off" />
            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmation(""); }}>Cancel</SecondaryButton>
              <button type="submit" disabled={deleteConfirmation !== group.name || deletingGroup} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">
                {deletingGroup ? "Deleting…" : "Delete group"}
              </button>
            </div>
          </form>
        </div>
      )}
      <div
        className={`fixed inset-0 z-[65] grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm transition-opacity sm:p-6 ${callType ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}
        aria-hidden={!callType}
      >
          <section className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <CallsWorkspace
              key={`${group.id}-${callType || "idle"}`}
              embeddedGroupId={group.id}
              embeddedCallType={callType || "audio"}
              embedded
              onIncomingCall={openIncomingCall}
              onClose={() => setCallType("")}
            />
          </section>
      </div>
    </section>
  );
}
