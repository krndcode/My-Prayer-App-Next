import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

export async function DELETE(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Type the group name to confirm deletion." }, { status: 400 });
  }
  if (typeof body?.confirmation !== "string" || body.confirmation.length > 80) {
    return NextResponse.json({ error: "Type the group name to confirm deletion." }, { status: 400 });
  }

  try {
    const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Sign in again to delete this group." }, { status: 401 });
    }

    const user = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
    const db = getFirebaseAdminDb();
    const { groupId } = await params;
    const groupRef = db.collection("prayerGroups").doc(groupId);
    const [group, membership] = await Promise.all([
      groupRef.get(),
      groupRef.collection("members").doc(user.uid).get()
    ]);

    if (!group.exists) {
      return NextResponse.json({ error: "This prayer group no longer exists." }, { status: 404 });
    }
    if (
      group.data().creatorUid !== user.uid ||
      !membership.exists ||
      membership.data().role !== "admin"
    ) {
      return NextResponse.json({ error: "Only this group's administrator can delete it." }, { status: 403 });
    }
    if (body.confirmation !== group.data().name) {
      return NextResponse.json({ error: "The group name did not match." }, { status: 400 });
    }

    const [schedules, calls] = await Promise.all([
      db.collection("prayerSchedules").where("groupId", "==", groupId).get(),
      db.collection("callSessions").where("groupId", "==", groupId).get()
    ]);
    const relatedNotifications = await Promise.all([
      ...schedules.docs.map((schedule) =>
        db.collection("notifications").where("scheduleId", "==", schedule.id).get()
      ),
      ...calls.docs.map((call) =>
        db.collection("notifications").where("callId", "==", call.id).get()
      )
    ]);
    const notificationRefs = new Map(
      relatedNotifications.flatMap((snapshot) =>
        snapshot.docs.map((notification) => [notification.ref.path, notification.ref])
      )
    );
    await Promise.all([
      ...schedules.docs.map((schedule) => db.recursiveDelete(schedule.ref)),
      ...calls.docs.map((call) => db.recursiveDelete(call.ref)),
      ...[...notificationRefs.values()].map((notificationRef) => notificationRef.delete())
    ]);
    await db.recursiveDelete(groupRef);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error.code?.startsWith("auth/")) {
      return NextResponse.json({ error: "Your session expired. Sign in again and retry." }, { status: 401 });
    }
    console.error("Unable to delete prayer group.", error);
    return NextResponse.json(
      { error: "Unable to delete this group and its related content. Please retry." },
      { status: 500 }
    );
  }
}
