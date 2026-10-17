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

async function getModerator() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;

  const decoded = await getFirebaseAdminAuth().verifySessionCookie(session, true);
  return decoded.moderator === true ? decoded : null;
}

export async function GET() {
  try {
    const moderator = await getModerator();
    if (!moderator) return NextResponse.json({ error: "Moderator access is required." }, { status: 403 });

    const db = getFirebaseAdminDb();
    const snapshot = await db.collection("reports")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const reports = await Promise.all(snapshot.docs.map(async (report) => {
      const data = report.data();
      const post = await db.collection(data.contentType).doc(data.contentId).get();
      return {
        id: report.id,
        ...data,
        content: post.exists ? {
          text: post.data().text || "",
          authorName: post.data().anonymous ? "Anonymous community member" : post.data().authorName || "Community member",
          status: post.data().status
        } : null
      };
    }));
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Unable to load moderation reports.", error);
    return NextResponse.json({ error: "Unable to load reports." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid moderation action is required." }, { status: 400 });
  }
  if (typeof body?.reportId !== "string" || !["remove", "dismiss"].includes(body.action)) {
    return NextResponse.json({ error: "Choose a valid report and moderation action." }, { status: 400 });
  }

  try {
    const moderator = await getModerator();
    if (!moderator) return NextResponse.json({ error: "Moderator access is required." }, { status: 403 });

    const db = getFirebaseAdminDb();
    const reportRef = db.collection("reports").doc(body.reportId);
    const report = await reportRef.get();
    if (!report.exists) return NextResponse.json({ error: "This report no longer exists." }, { status: 404 });

    const data = report.data();
    if (!["prayerRequests", "testimonies"].includes(data.contentType) || typeof data.contentId !== "string") {
      return NextResponse.json({ error: "This report contains invalid content references." }, { status: 400 });
    }
    if (body.action === "remove") {
      const postRef = db.collection(data.contentType).doc(data.contentId);
      const post = await postRef.get();
      if (post.exists) {
        await postRef.update({
          status: "deleted",
          text: "",
          updatedAt: FieldValue.serverTimestamp()
        });
        if (post.data().anonymous) {
          await db.recursiveDelete(postRef.collection("moderation"));
        }
      }
    }

    await reportRef.update({
      reviewStatus: body.action === "remove" ? "removed" : "dismissed",
      reviewedBy: moderator.uid,
      reviewedAt: FieldValue.serverTimestamp()
    });
    return NextResponse.json({ reviewed: true });
  } catch (error) {
    console.error("Unable to process a moderation action.", error);
    return NextResponse.json({ error: "Unable to complete this moderation action." }, { status: 500 });
  }
}
