import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

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

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid invitation request is required." }, { status: 400 });
  }
  if (
    typeof body?.sourceGroupId !== "string" ||
    !Array.isArray(body?.uids) ||
    body.uids.length < 1 ||
    body.uids.length > 200 ||
    body.uids.some((uid) => typeof uid !== "string" || uid.length > 128) ||
    new Set(body.uids).size !== body.uids.length
  ) {
    return NextResponse.json({ error: "Select between 1 and 200 unique group members to invite." }, { status: 400 });
  }

  try {
    const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!session) return NextResponse.json({ error: "Sign in again to invite group members." }, { status: 401 });
    const user = await getFirebaseAdminAuth().verifySessionCookie(session, true);
    const db = getFirebaseAdminDb();
    const scheduleRef = db.collection("prayerSchedules").doc((await params).scheduleId);
    const [schedule, ownMembership] = await Promise.all([
      scheduleRef.get(),
      db.collection("prayerGroups").doc(body.sourceGroupId).collection("members").doc(user.uid).get()
    ]);

    if (!schedule.exists || schedule.data().creatorUid !== user.uid || schedule.data().groupId !== null) {
      return NextResponse.json({ error: "Only the creator of a private session can invite guests." }, { status: 403 });
    }
    if (!ownMembership.exists) {
      return NextResponse.json({ error: "You must belong to the selected group to invite its members." }, { status: 403 });
    }
    if (body.uids.includes(user.uid)) {
      return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
    }

    const memberRefs = body.uids.map((uid) =>
      db.collection("prayerGroups").doc(body.sourceGroupId).collection("members").doc(uid)
    );
    const memberSnapshots = await db.getAll(...memberRefs);
    if (memberSnapshots.some((member) => !member.exists)) {
      return NextResponse.json({ error: "Every invitee must still belong to the selected group." }, { status: 400 });
    }

    const batch = db.batch();
    body.uids.forEach((uid) => {
      batch.set(scheduleRef.collection("invitations").doc(uid), {
        uid,
        sourceGroupId: body.sourceGroupId,
        invitedBy: user.uid,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: false });
    });
    await batch.commit();
    return NextResponse.json({ invitationsSent: body.uids.length });
  } catch (error) {
    if (error.code?.startsWith("auth/")) {
      return NextResponse.json({ error: "Your session expired. Sign in again and retry." }, { status: 401 });
    }
    console.error("Unable to invite schedule participants.", error);
    return NextResponse.json({ error: "Unable to send these prayer-session invitations." }, { status: 500 });
  }
}
