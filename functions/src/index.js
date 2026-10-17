const { createHash } = require("node:crypto");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getRecurrenceDates } = require("./schedule-recurrence");

const app = getApps()[0] || initializeApp();
const db = getFirestore(app, "default");
const messaging = getMessaging(app);

function notificationId(...parts) {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

async function createNotification(uid, id, type, title, body, data = {}) {
  const userRef = db.collection("users").doc(uid);
  const user = await userRef.get();
  if (!user.exists) return;
  const preferences = user.data().notificationPreferences || {};
  if (type === "schedule-reminder" && preferences.scheduleReminders === false) return;
  if (type !== "schedule-reminder" && preferences.groupActivity === false) return;

  const notificationRef = db.collection("notifications").doc(id);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return;
    transaction.create(notificationRef, {
      uid,
      type,
      title,
      body,
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null
    });
  });
}

exports.deliverNotification = onDocumentCreated(
  { document: "notifications/{notificationId}", database: "default" },
  async (event) => {
    const notification = event.data.data();
    const tokens = await db.collection("deviceTokens").where("uid", "==", notification.uid).get();
    if (tokens.empty) return;

    const records = tokens.docs;
    const response = await messaging.sendEachForMulticast({
      tokens: records.map((record) => record.data().token),
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: "/icons/prayer-line.svg",
          tag: event.params.notificationId,
          data: {
            url: notification.type === "schedule-reminder" || notification.type === "schedule-invitation"
              ? "/schedule"
              : "/prayer"
          }
        }
      }
    });

    const deletes = [];
    response.responses.forEach((result, index) => {
      if (!result.success && [
        "messaging/invalid-registration-token",
        "messaging/registration-token-not-registered"
      ].includes(result.error?.code)) {
        deletes.push(records[index].ref.delete());
      }
    });
    await Promise.all(deletes);
  }
);

exports.notifyScheduleInvitation = onDocumentCreated(
  {
    document: "prayerSchedules/{scheduleId}/invitations/{uid}",
    database: "default"
  },
  async (event) => {
    const invitation = event.data.data();
    if (invitation.status !== "pending") return;
    await createNotification(
      event.params.uid,
      notificationId("invitation", event.params.scheduleId, event.params.uid),
      "schedule-invitation",
      "Prayer session invitation",
      "You have been invited to a prayer session.",
      { scheduleId: event.params.scheduleId }
    );
  }
);

exports.notifyIncomingPrayerCall = onDocumentCreated(
  { document: "callSessions/{callId}", database: "default" },
  async (event) => {
    const call = event.data.data();
    if (call.status !== "ringing" || !call.calleeUid) return;
    await createNotification(
      call.calleeUid,
      notificationId("call", event.params.callId, call.calleeUid),
      "call-invitation",
      "Incoming prayer call",
      `${call.callerName || "A prayer group member"} is calling you.`,
      { callId: event.params.callId }
    );
  }
);

exports.notifyGroupMessage = onDocumentCreated(
  {
    document: "prayerGroups/{groupId}/messages/{messageId}",
    database: "default"
  },
  async (event) => {
    const message = event.data.data();
    const members = await db.collection("prayerGroups")
      .doc(event.params.groupId)
      .collection("members")
      .get();

    await Promise.all(members.docs
      .filter((member) => member.id !== message.uid)
      .map((member) => createNotification(
        member.id,
        notificationId("message", event.params.groupId, event.params.messageId, member.id),
        "group-activity",
        "Prayer group update",
        "A member shared a new message in your prayer group.",
        { groupId: event.params.groupId }
      )));
  }
);

exports.sendPrayerSessionReminders = onSchedule(
  { schedule: "every 5 minutes", timeZone: "UTC", retryCount: 3 },
  async () => {
    const now = Date.now();
    const windowEndMs = now + 15 * 60 * 1000;
    const scheduleQuery = db.collection("prayerSchedules")
      .where("cancelled", "==", false)
      .where("startsAt", ">=", Timestamp.fromMillis(now - 6 * 365 * 24 * 60 * 60 * 1000))
      .where("startsAt", "<=", Timestamp.fromMillis(windowEndMs))
      .orderBy("startsAt");
    let lastSchedule = null;

    while (true) {
      let pageQuery = scheduleQuery.limit(100);
      if (lastSchedule) pageQuery = pageQuery.startAfter(lastSchedule);
      const schedules = await pageQuery.get();
      if (schedules.empty) return;
      lastSchedule = schedules.docs[schedules.docs.length - 1];

      await Promise.all(schedules.docs.map(async (schedule) => {
        const session = schedule.data();
        let occurrences;
        try {
          occurrences = getRecurrenceDates(
            session.startsAt.toDate(),
            session.recurrence,
            session.timeZone
          ).filter((occurrence) => {
            const occurrenceTime = occurrence.getTime();
            return occurrenceTime >= now && occurrenceTime <= windowEndMs;
          });
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          console.error(`Skipping prayer-session reminders for ${schedule.id}: invalid time zone.`, error);
          return;
        }
        if (occurrences.length === 0) return;

        const recipients = new Set([session.creatorUid]);
        if (session.groupId) {
          const members = await db.collection("prayerGroups")
            .doc(session.groupId)
            .collection("members")
            .get();
          members.docs.forEach((member) => recipients.add(member.id));
        } else {
          const accepted = await schedule.ref.collection("invitations")
            .where("status", "==", "accepted")
            .get();
          accepted.docs.forEach((invitation) => recipients.add(invitation.id));
        }

        await Promise.all(occurrences.flatMap((occurrence) =>
          [...recipients].map((uid) => createNotification(
            uid,
            notificationId("reminder", schedule.id, occurrence.toISOString(), uid),
            "schedule-reminder",
            "Prayer session reminder",
            "A prayer session is starting soon.",
            {
              scheduleId: schedule.id,
              occurrenceAt: Timestamp.fromDate(occurrence)
            }
          ))
        ));
      }));

      if (schedules.size < 100) return;
    }
  }
);
