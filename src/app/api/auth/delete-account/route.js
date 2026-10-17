import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
  getFirebaseAdminStorage
} from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

const RECENT_AUTH_WINDOW_SECONDS = 5 * 60;
const COLLECTIONS_WITH_UID = ["attendance", "invitations", "messages", "prayingUsers", "reactions", "comments", "moderation"];

function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    new URL(request.url).protocol.slice(0, -1);

  if (!origin || !host) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.host.toLowerCase() === host.toLowerCase() &&
      originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

async function deleteQuery(query) {
  const snapshot = await query.get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

async function deleteUserSubcollections(db, uid) {
  for (const collectionName of COLLECTIONS_WITH_UID) {
    await deleteQuery(db.collectionGroup(collectionName).where("uid", "==", uid));
  }

  await deleteQuery(db.collection("reports").where("reporterUid", "==", uid));
  await deleteQuery(db.collection("deviceTokens").where("uid", "==", uid));
  await deleteQuery(db.collection("notifications").where("uid", "==", uid));
  const calls = await db.collection("callSessions").where("participantUids", "array-contains", uid).get();
  await Promise.all(calls.docs.map((call) => db.recursiveDelete(call.ref)));
}

async function transferGroups(db, uid) {
  const memberships = await db.collectionGroup("members").where("uid", "==", uid).get();
  const ownedGroups = new Map();

  for (const membership of memberships.docs) {
    const groupRef = membership.ref.parent.parent;
    if (groupRef) ownedGroups.set(groupRef.path, { groupRef, membership });
  }

  const transfers = new Map();
  for (const { groupRef, membership } of ownedGroups.values()) {
    const group = await groupRef.get();
    if (!group.exists || group.data().creatorUid !== uid) continue;

    const members = await groupRef.collection("members").orderBy("joinedAt", "asc").get();
    const successor = members.docs.find((member) => member.id !== uid);
    if (!successor) {
      const schedules = await db.collection("prayerSchedules").where("groupId", "==", groupRef.id).get();
      await Promise.all(schedules.docs.map((schedule) => db.recursiveDelete(schedule.ref)));
      await db.recursiveDelete(groupRef);
      transfers.set(groupRef.id, null);
      continue;
    }

    const successorName = successor.data().displayName || "Group administrator";
    await db.runTransaction(async (transaction) => {
      transaction.update(groupRef, {
        creatorUid: successor.id,
        creatorName: successorName,
        memberCount: Math.max(1, (group.data().memberCount || members.size) - 1),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(successor.ref, { role: "admin" });
    });
    transfers.set(groupRef.id, successor.id);
  }

  for (const { membership } of ownedGroups.values()) {
    const groupRef = membership.ref.parent.parent;
    if (groupRef && !transfers.has(groupRef.id)) {
      await groupRef.update({
        memberCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    await membership.ref.delete();
  }
  return transfers;
}

async function deleteOwnedSchedules(db, uid, transfers) {
  const schedules = await db.collection("prayerSchedules").where("creatorUid", "==", uid).get();
  for (const schedule of schedules.docs) {
    const groupId = schedule.data().groupId;
    const successorUid = groupId ? transfers.get(groupId) : null;

    if (successorUid) {
      await schedule.ref.update({
        creatorUid: successorUid,
        cancelled: true,
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      await db.recursiveDelete(schedule.ref);
    }
  }
}

async function anonymizeSharedPosts(db, collectionName, uid) {
  const posts = await db.collection(collectionName).where("authorUid", "==", uid).get();
  for (const post of posts.docs) {
    await post.ref.update({
      authorUid: FieldValue.delete(),
      authorName: "Former community member",
      authorPhotoURL: null,
      updatedAt: FieldValue.serverTimestamp()
    });
  }
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid confirmation is required." }, { status: 400 });
  }
  if (body?.confirmation !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm account removal." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Sign in again to delete your account." }, { status: 401 });
  }

  try {
    const auth = getFirebaseAdminAuth();
    const user = await auth.verifySessionCookie(sessionCookie, true);
    const authAge = Math.floor(Date.now() / 1000) - user.auth_time;
    if (authAge < 0 || authAge > RECENT_AUTH_WINDOW_SECONDS) {
      return NextResponse.json(
        { error: "For your security, re-enter your password before deleting your account." },
        { status: 401 }
      );
    }

    const db = getFirebaseAdminDb();
    const transfers = await transferGroups(db, user.uid);
    await deleteOwnedSchedules(db, user.uid, transfers);
    await Promise.all([
      anonymizeSharedPosts(db, "prayerRequests", user.uid),
      anonymizeSharedPosts(db, "testimonies", user.uid)
    ]);
    await deleteUserSubcollections(db, user.uid);

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (bucketName) {
      const bucket = getFirebaseAdminStorage().bucket(bucketName);
      const [bucketExists] = await bucket.exists();
      if (bucketExists) {
        await bucket.deleteFiles({ prefix: `users/${user.uid}/`, force: true });
      }
    }

    await db.recursiveDelete(db.collection("users").doc(user.uid));
    await auth.deleteUser(user.uid);

    const response = NextResponse.json({ deleted: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    if (["auth/argument-error", "auth/id-token-revoked", "auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/user-disabled", "auth/user-not-found"].includes(error.code)) {
      return NextResponse.json({ error: "Your session expired. Sign in again and retry." }, { status: 401 });
    }
    console.error("Unable to complete account deletion.", error);
    return NextResponse.json(
      { error: "We couldn't finish deleting your account. Contact support before retrying." },
      { status: 500 }
    );
  }
}
