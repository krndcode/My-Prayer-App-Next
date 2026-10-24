"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeading,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextAreaField,
  formatDate
} from "@/components/ui/DashboardPrimitives";

const db = getFirebaseDb();

function describeError(error) {
  if (error.code === "permission-denied") return "You don't have permission to access this post.";
  if (error.code === "unavailable") return "The service is unavailable. Check your connection and try again.";
  return error.message || "The change could not be saved. Please try again.";
}

export default function HeatRoomWorkspace() {
  const { user, loading: authLoading } = useCurrentUser();
  const [feedPosts, setFeedPosts] = useState([]);
  const [anonymousPosts, setAnonymousPosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [defaultAudience, setDefaultAudience] = useState("public");
  const [anonymousPostKeys, setAnonymousPostKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [kind, setKind] = useState("prayer");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Mobile only: the composer is collapsed by default so the feed stays within reach.
  const [composerOpen, setComposerOpen] = useState(false);

  // Success messages fade away on their own so they never sit over content on small screens.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user) return undefined;
    const stopProfile = onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        const preferred = snapshot.data()?.privacyPreferences?.defaultPostAudience;
        if (preferred === "public" || preferred === "private") setDefaultAudience(preferred);
      },
      (snapshotError) => setError(describeError(snapshotError))
    );
    return () => stopProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const stopMemberships = onSnapshot(
      query(collectionGroup(db, "members"), where("uid", "==", user.uid)),
      (snapshot) => {
        const memberships = snapshot.docs.map((member) => member.ref.parent.parent?.id).filter(Boolean);
        setGroupIds(memberships);
        if (memberships.length === 0) setGroups([]);
      },
      (snapshotError) => setError(describeError(snapshotError))
    );
    return () => stopMemberships();
  }, [user]);

  useEffect(() => {
    if (!user || groupIds.length === 0) return undefined;
    const stops = groupIds.map((groupId) =>
      onSnapshot(doc(db, "prayerGroups", groupId), (snapshot) => {
        if (snapshot.exists()) {
          setGroups((current) => [...current.filter((group) => group.id !== groupId), { id: groupId, ...snapshot.data() }]);
        }
      }, (snapshotError) => setError(describeError(snapshotError)))
    );
    return () => stops.forEach((stop) => stop());
  }, [groupIds, user]);

  useEffect(() => {
    if (!user) return undefined;
    const feeds = new Map();
    const updateFeed = (key, snapshots) => {
      feeds.set(key, snapshots.map((post) => ({ id: post.id, ...post.data() })));
      setFeedPosts(
        Array.from(
          Array.from(feeds.values())
            .flat()
            .filter((post) => post.status !== "deleted")
            .reduce((unique, post) => unique.set(`${post.type}/${post.id}`, post), new Map())
            .values()
        ).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      );
      setLoading(false);
    };
    const stops = [];
    const connect = (key, postType, constraints) => {
      stops.push(
        onSnapshot(
          query(collection(db, postType), ...constraints),
          (snapshot) => {
            updateFeed(key, snapshot.docs.map((post) => ({
              id: post.id,
              ref: post.ref,
              data: () => post.data()
            })));
            setError("");
          },
          (snapshotError) => {
            setError(describeError(snapshotError));
            setLoading(false);
          }
        )
      );
    };
    for (const postType of ["prayerRequests", "testimonies"]) {
      connect(`${postType}-public`, postType, [
        where("audience", "==", "public"),
        where("status", "==", "active"),
        orderBy("createdAt", "desc"),
        limit(40)
      ]);
      connect(`${postType}-own`, postType, [
        where("authorUid", "==", user.uid),
        where("status", "==", "active"),
        orderBy("createdAt", "desc"),
        limit(40)
      ]);
      if (groupIds.length > 0) {
        connect(`${postType}-groups`, postType, [
          where("audience", "==", "group"),
          where("groupId", "in", groupIds.slice(0, 10)),
          where("status", "==", "active"),
          orderBy("createdAt", "desc"),
          limit(40)
        ]);
      } else {
        feeds.set(`${postType}-groups`, []);
      }
    }
    return () => stops.forEach((stop) => stop());
  }, [groupIds, user]);

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    const stopIdentities = onSnapshot(
      query(collectionGroup(db, "moderation"), where("uid", "==", user.uid)),
      async (snapshot) => {
        try {
          const identities = await Promise.all(
            snapshot.docs.map(async (identity) => {
              const postRef = identity.ref.parent.parent;
              if (!postRef) return null;
              const postSnapshot = await getDoc(postRef);
              if (!postSnapshot.exists()) return null;
              const type = postRef.parent.id;
              return { id: postSnapshot.id, type, ...postSnapshot.data() };
            })
          );
          if (!live) return;
          setAnonymousPostKeys(
            identities.filter(Boolean).map((entry) => `${entry.type}/${entry.id}`)
          );
          setAnonymousPosts(identities.filter((entry) => entry && entry.status !== "deleted"));
        } catch (identityError) {
          setError(describeError(identityError));
        }
      },
      (snapshotError) => setError(describeError(snapshotError))
    );
    return () => {
      live = false;
      stopIdentities();
    };
  }, [user]);

  const visiblePosts = useMemo(
    () =>
      Array.from(
        [...feedPosts, ...anonymousPosts].reduce(
          (unique, post) => unique.set(`${post.type}/${post.id}`, post),
          new Map()
        ).values()
      ).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
    [anonymousPosts, feedPosts]
  );

  async function createPost(event) {
    event.preventDefault();
    if (!user) return;
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const text = String(form.get("text") || "").trim();
    const audience = String(form.get("audience") || "public");
    const groupId = String(form.get("groupId") || "");
    const anonymous = kind === "prayer" && form.get("anonymous") === "on";
    if (text.length < 4 || text.length > 3000) {
      setError("Write between 4 and 3,000 characters.");
      return;
    }
    if (audience === "group" && (!groupId || !groupIds.includes(groupId))) {
      setError("Choose one of your joined prayer groups.");
      return;
    }
    setPosting(true);
    setError("");
    setNotice("");
    try {
      const postType = kind === "prayer" ? "prayerRequests" : "testimonies";
      const postRef = doc(collection(db, postType));
      const batch = writeBatch(db);
      const postData = {
        type: postType,
        text,
        audience,
        groupId: audience === "group" ? groupId : null,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (!anonymous) {
        postData.authorUid = user.uid;
        postData.authorName = user.displayName || user.email?.split("@")[0] || "Community member";
        postData.authorPhotoURL = user.photoURL || null;
      } else {
        postData.anonymous = true;
      }
      batch.set(postRef, postData);
      if (anonymous) {
        batch.set(doc(db, postType, postRef.id, "moderation", "identity"), {
          uid: user.uid,
          createdAt: serverTimestamp()
        });
      }
      await batch.commit();
      formElement.reset();
      setComposerOpen(false);
      setNotice(anonymous ? "Your anonymous prayer request was shared." : "Your post was shared.");
    } catch (postError) {
      setError(describeError(postError));
    } finally {
      setPosting(false);
    }
  }

  async function softDelete(post) {
    if (!window.confirm("Remove this post from the community feed?")) return;
    setError("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, post.type, post.id), {
        status: "deleted",
        text: "",
        updatedAt: serverTimestamp()
      });
      if (post.anonymous) batch.delete(doc(db, post.type, post.id, "moderation", "identity"));
      await batch.commit();
      setNotice("The post was removed from the feed.");
    } catch (deleteError) {
      setError(describeError(deleteError));
    }
  }

  if (authLoading || loading) return <LoadingState label="Opening the Heat Room…" />;
  if (!user) return <Notice>Please sign in again to open the Heat Room.</Notice>;

  return (
    <div className="min-w-0">
      <PageHeading
        eyebrow="Community care"
        title="The Heat Room"
        description="A place to carry prayer requests together and celebrate what God is doing."
      />

      {/*
        Mobile order: composer, feed, reminder.
        xl and up: feed on the left (spanning both rows), composer and reminder stacked on the right.
      */}
      <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:grid-rows-[auto_1fr]">
        <div className="order-2 min-w-0 space-y-4 xl:order-1 xl:row-span-2">
          {visiblePosts.length === 0 ? (
            <Panel>
              <EmptyState
                title="Start the conversation"
                description="Share a request or testimony with your community. Your audience and privacy choices stay attached to each post."
              />
            </Panel>
          ) : (
            visiblePosts.map((post) => (
              <PostCard
                key={`${post.type}/${post.id}`}
                post={post}
                user={user}
                isOwner={post.authorUid === user.uid || anonymousPostKeys.includes(`${post.type}/${post.id}`)}
                onDelete={() => softDelete(post)}
                onError={setError}
              />
            ))
          )}
        </div>

        <Panel className="order-1 min-w-0 xl:order-2">
          <h2 className="text-lg font-semibold">Share with care</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Prayer requests and testimonies can be shared publicly, with a group, or privately with you.
          </p>

          {/* Phones and tablets: tap to open the composer. Hidden on xl, where the form is always visible. */}
          <button
            type="button"
            aria-expanded={composerOpen}
            aria-controls="heat-composer"
            onClick={() => setComposerOpen((value) => !value)}
            className={`mt-4 flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition xl:hidden ${
              composerOpen
                ? "border border-slate-200 bg-white text-slate-700"
                : "bg-teal-800 text-white hover:bg-teal-900"
            }`}
          >
            {composerOpen ? "Close" : "Share a prayer or testimony"}
          </button>

          <div id="heat-composer" className={`${composerOpen ? "block" : "hidden"} xl:block`}>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                aria-pressed={kind === "prayer"}
                onClick={() => setKind("prayer")}
                className={`min-h-11 flex-1 rounded-xl px-2 py-2 text-center text-sm font-semibold leading-tight sm:px-3 ${kind === "prayer" ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                Prayer request
              </button>
              <button
                type="button"
                aria-pressed={kind === "testimony"}
                onClick={() => setKind("testimony")}
                className={`min-h-11 flex-1 rounded-xl px-2 py-2 text-center text-sm font-semibold leading-tight sm:px-3 ${kind === "testimony" ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                Testimony
              </button>
            </div>
            <form onSubmit={createPost} className="mt-4 space-y-4">
              <TextAreaField
                id="heat-post-text"
                name="text"
                label={kind === "prayer" ? "What would you like prayer for?" : "What would you like to celebrate?"}
                required
                minLength={4}
                maxLength={3000}
                rows={5}
              />
              <SelectField
                key={defaultAudience}
                id="post-audience"
                name="audience"
                label="Who can see this?"
                defaultValue={defaultAudience}
              >
                <option value="public">Everyone in the community</option>
                <option value="group" disabled={groups.length === 0}>One of my groups</option>
                <option value="private">Only me</option>
              </SelectField>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-800">Prayer group</span>
                <select name="groupId" className="auth-input" defaultValue="" disabled={groups.length === 0}>
                  <option value="">Choose a group (if sharing with a group)</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              {kind === "prayer" && (
                <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <input type="checkbox" name="anonymous" className="mt-1 size-4 shrink-0 accent-teal-800" />
                  <span className="min-w-0">
                    Share anonymously
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Your name is hidden from readers. Only your private account can access the moderation identity.
                    </span>
                  </span>
                </label>
              )}
              <PrimaryButton type="submit" disabled={posting} className="w-full">
                {posting ? "Sharing…" : kind === "prayer" ? "Share prayer request" : "Share testimony"}
              </PrimaryButton>
            </form>
          </div>
        </Panel>

        <Panel className="order-3 min-w-0 border-sky-100 bg-sky-50/60">
          <h2 className="text-sm font-semibold">A gentle reminder</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Avoid posting passwords, financial information, or details that could put you or someone else at risk.
          </p>
        </Panel>
      </div>

      {(error || notice) && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 sm:left-auto sm:w-[420px] lg:bottom-6">
          <Notice tone={error ? "error" : "success"}>{error || notice}</Notice>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, user, isOwner, onDelete, onError }) {
  const [isPraying, setIsPraying] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const interactions = post.type === "prayerRequests" ? "prayingUsers" : "reactions";

  useEffect(() => {
    const interactionRef = doc(db, post.type, post.id, interactions, user.uid);
    return onSnapshot(interactionRef, (snapshot) => {
      if (post.type === "prayerRequests") setIsPraying(snapshot.exists());
      else setReacted(snapshot.exists());
    }, onError);
  }, [interactions, onError, post.id, post.type, user.uid]);

  useEffect(() => {
    if (!showComments) return undefined;
    return onSnapshot(
      query(collection(db, post.type, post.id, "comments"), orderBy("createdAt", "asc"), limit(30)),
      (snapshot) => setComments(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
      onError
    );
  }, [post.id, post.type, showComments, onError]);

  async function toggleAcknowledgment() {
    onError("");
    const ref = doc(db, post.type, post.id, interactions, user.uid);
    try {
      if (post.type === "prayerRequests") {
        if (isPraying) await deleteDoc(ref);
        else await setDoc(ref, { uid: user.uid, createdAt: serverTimestamp() });
      } else if (reacted) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { uid: user.uid, emoji: "heart", createdAt: serverTimestamp() });
      }
    } catch (interactionError) {
      onError(describeError(interactionError));
    }
  }

  async function addComment(event) {
    event.preventDefault();
    const text = comment.trim();
    if (text.length < 1 || text.length > 1000) return;
    setSavingComment(true);
    onError("");
    try {
      await addDoc(collection(db, post.type, post.id, "comments"), {
        uid: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Community member",
        text,
        createdAt: serverTimestamp()
      });
      setComment("");
    } catch (commentError) {
      onError(describeError(commentError));
    } finally {
      setSavingComment(false);
    }
  }

  async function reportPost() {
    const reason = window.prompt("Briefly tell us why you're reporting this post.");
    if (!reason?.trim()) return;
    if (reason.trim().length > 300) {
      onError("Report notes must be 300 characters or fewer.");
      return;
    }
    onError("");
    try {
      await addDoc(collection(db, "reports"), {
        reporterUid: user.uid,
        contentType: post.type,
        contentId: post.id,
        reason: reason.trim(),
        createdAt: serverTimestamp()
      });
      window.alert("Thank you. Your report was recorded for moderator review.");
    } catch (reportError) {
      onError(describeError(reportError));
    }
  }

  const audience = post.audience === "public" ? "Community" : post.audience === "group" ? "Group members" : "Private";
  return (
    <Panel>
      <article className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900">
              {post.anonymous ? "?" : (post.authorName || "M").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {post.anonymous ? "Anonymous community member" : post.authorName || "Community member"}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {post.type === "testimonies" ? "Testimony" : "Prayer request"} · {formatDate(post.createdAt)}
              </p>
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {audience}
          </span>
        </div>
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{post.text}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <SecondaryButton type="button" onClick={toggleAcknowledgment}>
            {post.type === "prayerRequests"
              ? isPraying ? "Praying ✓" : "I’m praying"
              : reacted ? "Grateful ♥" : "Celebrate"}
          </SecondaryButton>
          <SecondaryButton type="button" onClick={() => setShowComments((value) => !value)}>
            {showComments ? "Hide replies" : "Encourage"}
          </SecondaryButton>
          {isOwner ? (
            <button type="button" onClick={onDelete} className="-mr-2 ml-auto inline-flex min-h-11 items-center px-2 text-xs font-medium text-slate-500 hover:text-red-700">
              Remove post
            </button>
          ) : (
            <button type="button" onClick={reportPost} className="-mr-2 ml-auto inline-flex min-h-11 items-center px-2 text-xs font-medium text-slate-500 hover:text-red-700">
              Report
            </button>
          )}
        </div>

        {showComments && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="space-y-3">
              {comments.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-semibold text-slate-800">{entry.authorName}</p>
                    <time className="shrink-0 text-[10px] text-slate-400">{formatDate(entry.createdAt)}</time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{entry.text}</p>
                </div>
              ))}
              {comments.length === 0 && <p className="text-xs text-slate-500">Be the first to offer encouragement.</p>}
            </div>
            <form onSubmit={addComment} className="mt-3 flex gap-2">
              <label htmlFor={`comment-${post.id}`} className="sr-only">Write an encouraging reply</label>
              <input
                id={`comment-${post.id}`}
                className="auth-input min-w-0 flex-1"
                placeholder="Write a kind reply…"
                maxLength={1000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <PrimaryButton type="submit" disabled={savingComment || !comment.trim()} className="shrink-0">
                {savingComment ? "…" : "Reply"}
              </PrimaryButton>
            </form>
          </div>
        )}
      </article>
    </Panel>
  );
}
