"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { getRecurrenceDates } from "@/lib/schedule-recurrence.mjs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  EmptyState,
  Field,
  LoadingState,
  Notice,
  PageHeading,
  Panel,
  PrimaryButton,
  SelectField,
  SecondaryButton,
  TextAreaField,
  formatDate
} from "@/components/ui/DashboardPrimitives";

const db = getFirebaseDb();
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function getDateTimeValue(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid date and time.");
  if (date.getTime() <= Date.now()) throw new Error("Prayer sessions need to start in the future.");
  return date;
}

function getActionError(error) {
  if (error.code === "permission-denied") return "You don't have permission to change this session.";
  if (error.code === "unavailable") return "The service is unavailable. Check your connection and try again.";
  return error.message || "The change could not be saved. Please try again.";
}

export default function ScheduleWorkspace() {
  const { user, loading: authLoading } = useCurrentUser();
  const [sessions, setSessions] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [groups, setGroups] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [invitationStatuses, setInvitationStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formRef = useRef(null);

  // Success messages fade away on their own so they never sit over content on small screens.
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // When the form opens (for example after tapping Edit far down the list), bring it into view.
  useEffect(() => {
    if (!showForm) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    formRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [showForm, editing]);

  useEffect(() => {
    if (!user) return undefined;
    const stopOwned = onSnapshot(
      query(
        collection(db, "prayerSchedules"),
        where("creatorUid", "==", user.uid),
        orderBy("startsAt", "asc")
      ),
      (snapshot) => {
        setSessions((previous) => mergeSessions(previous, snapshot.docs));
        setLoading(false);
      },
      (snapshotError) => {
        setError(getActionError(snapshotError));
        setLoading(false);
      }
    );
    const stopMemberships = onSnapshot(
      query(collectionGroup(db, "members"), where("uid", "==", user.uid)),
      (snapshot) => {
        const memberships = snapshot.docs.map((membership) => membership.ref.parent.parent?.id).filter(Boolean);
        setGroupIds(memberships);
        if (memberships.length === 0) setGroups([]);
      },
      (snapshotError) => setError(getActionError(snapshotError))
    );
    const stopAttendance = onSnapshot(
      query(collectionGroup(db, "attendance"), where("uid", "==", user.uid)),
      (snapshot) => {
        setAttendance(
          Object.fromEntries(
            snapshot.docs.map((entry) => [entry.ref.parent.parent?.id, entry.data().status])
          )
        );
      },
      (snapshotError) => setError(getActionError(snapshotError))
    );
    let live = true;
    const stopInvitations = onSnapshot(
      query(collectionGroup(db, "invitations"), where("uid", "==", user.uid)),
      async (snapshot) => {
        try {
          const invitations = await Promise.all(snapshot.docs.map(async (invitation) => {
            const scheduleRef = invitation.ref.parent.parent;
            if (!scheduleRef) return null;
            const schedule = await getDoc(scheduleRef);
            return schedule.exists()
              ? {
                  id: schedule.id,
                  ...schedule.data(),
                  invitationStatus: invitation.data().status,
                  invitationGroupId: invitation.data().sourceGroupId
                }
              : null;
          }));
          if (!live) return;
          const validInvitations = invitations.filter(Boolean);
          setInvitationStatuses(Object.fromEntries(validInvitations.map((entry) => [entry.id, entry.invitationStatus])));
          setSessions((previous) => mergeSessions(previous, validInvitations.map((entry) => ({
            id: entry.id,
            data: () => entry
          }))));
          setLoading(false);
        } catch (invitationError) {
          setError(getActionError(invitationError));
        }
      },
      (snapshotError) => setError(getActionError(snapshotError))
    );
    return () => {
      live = false;
      stopOwned();
      stopMemberships();
      stopAttendance();
      stopInvitations();
    };
  }, [user]);

  useEffect(() => {
    if (!user || groupIds.length === 0) return undefined;
    const stops = groupIds.map((groupId) =>
      onSnapshot(
        doc(db, "prayerGroups", groupId),
        (snapshot) => {
          if (snapshot.exists()) {
            setGroups((current) => [
              ...current.filter((group) => group.id !== groupId),
              { id: snapshot.id, ...snapshot.data() }
            ]);
          }
        },
        (snapshotError) => setError(getActionError(snapshotError))
      )
    );
    return () => stops.forEach((stop) => stop());
  }, [groupIds, user]);

  useEffect(() => {
    if (!user || groupIds.length === 0) return undefined;
    const groupedSessions = new Map();
    const stops = groupIds.map((groupId) =>
      onSnapshot(
        query(
          collection(db, "prayerSchedules"),
          where("groupId", "==", groupId),
          orderBy("startsAt", "asc")
        ),
        (snapshot) => {
          groupedSessions.set(groupId, snapshot.docs);
          setSessions((previous) => {
            const allGroupDocs = Array.from(groupedSessions.values()).flat();
            return mergeSessions(previous.filter((session) => !session.groupId), allGroupDocs);
          });
          setLoading(false);
        },
        (snapshotError) => setError(getActionError(snapshotError))
      )
    );
    return () => stops.forEach((stop) => stop());
  }, [groupIds, user]);

  const sortedSessions = useMemo(
    () => sessions.flatMap(expandOccurrences).sort(
      (left, right) => (left.startsAt?.toMillis?.() || 0) - (right.startsAt?.toMillis?.() || 0)
    ),
    [sessions]
  );

  async function saveSession(event) {
    event.preventDefault();
    if (!user) return;
    setError("");
    setNotice("");
    try {
      const data = new FormData(event.currentTarget);
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      const startsAt = toTimestamp(String(data.get("startsAt") || ""));
      const durationMinutes = Number(data.get("durationMinutes"));
      const sharingMode = String(data.get("sharingMode") || "private");
      const selectedGroupId = String(data.get("groupId") || "");
      const groupId = sharingMode === "group" ? selectedGroupId : null;
      const inviteeUids = data.getAll("inviteeUids").map(String);
      const recurrenceFrequency = String(data.get("recurrenceFrequency") || "none");
      const recurrenceCount = Number(data.get("recurrenceCount") || 1);

      if (!title || title.length > 100) throw new Error("Session titles must be between 1 and 100 characters.");
      if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
        throw new Error("Choose a duration from 15 minutes to 4 hours.");
      }
      if (description.length > 1000) throw new Error("Descriptions must be 1,000 characters or fewer.");
      if (sharingMode !== "private" && !groupIds.includes(selectedGroupId)) {
        throw new Error("Choose one of your joined groups.");
      }
      if (sharingMode === "invite" && inviteeUids.length === 0) {
        throw new Error("Select at least one group member to invite.");
      }
      if (!["none", "daily", "weekly", "monthly"].includes(recurrenceFrequency)) {
        throw new Error("Choose a valid recurrence frequency.");
      }
      if (recurrenceFrequency !== "none" &&
          (!Number.isInteger(recurrenceCount) || recurrenceCount < 2 || recurrenceCount > 52)) {
        throw new Error("Recurring sessions must include between 2 and 52 occurrences.");
      }
      const recurrence = recurrenceFrequency === "none"
        ? null
        : { frequency: recurrenceFrequency, interval: 1, count: recurrenceCount };

      const values = {
        title,
        description,
        startsAt,
        durationMinutes,
        timeZone: editing?.timeZone || timeZone,
        groupId: groupId || null,
        recurrence,
        updatedAt: serverTimestamp()
      };
      if (editing) {
        if ((editing.groupId || "") !== (groupId || "")) {
          throw new Error("The sharing group cannot be changed while editing a session.");
        }
        await updateDoc(doc(db, "prayerSchedules", editing.id), values);
        setNotice("Your prayer session was updated.");
      } else {
        const scheduleRef = doc(collection(db, "prayerSchedules"));
        await setDoc(scheduleRef, {
          ...values,
          creatorUid: user.uid,
          cancelled: false,
          createdAt: serverTimestamp()
        });
        if (sharingMode === "invite") {
          try {
            const response = await fetch(`/api/schedules/${scheduleRef.id}/invitations`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sourceGroupId: selectedGroupId, uids: inviteeUids })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Unable to send invitations.");
          } catch (invitationError) {
            await updateDoc(scheduleRef, {
              cancelled: true,
              updatedAt: serverTimestamp()
            });
            throw new Error(`The session was saved as cancelled because invitations could not be sent: ${invitationError.message}`);
          }
        }
        setNotice("Your prayer session is scheduled.");
      }
      setEditing(null);
      setShowForm(false);
    } catch (saveError) {
      setError(getActionError(saveError));
    }
  }

  async function cancelSession(session) {
    if (!window.confirm(`Cancel "${session.title}"? Group members will see it as cancelled.`)) return;
    setError("");
    setNotice("");
    try {
      await updateDoc(doc(db, "prayerSchedules", session.id), {
        cancelled: true,
        updatedAt: serverTimestamp()
      });
      setNotice("The session was cancelled.");
    } catch (cancelError) {
      setError(getActionError(cancelError));
    }
  }

  async function respond(session, status) {
    if (!user || (!session.groupId && invitationStatuses[session.id] !== "accepted")) return;
    setError("");
    setNotice("");
    try {
      await setDoc(doc(db, "prayerSchedules", session.id, "attendance", user.uid), {
        uid: user.uid,
        status,
        updatedAt: serverTimestamp()
      });
      setNotice(status === "attending" ? "You're marked as attending." : "Your response was updated.");
    } catch (respondError) {
      setError(getActionError(respondError));
    }
  }

  // This used to be defined outside the component, where `user`, `setError`, `setNotice` and
  // `setInvitationStatuses` don't exist, so tapping Accept or Decline threw a ReferenceError.
  async function respondToInvitation(session, status) {
    if (!user || !["accepted", "declined"].includes(status)) return;
    setError("");
    setNotice("");
    try {
      await updateDoc(doc(db, "prayerSchedules", session.id, "invitations", user.uid), {
        status,
        updatedAt: serverTimestamp()
      });
      setInvitationStatuses((current) => ({ ...current, [session.id]: status }));
      setNotice(status === "accepted" ? "You accepted the prayer invitation." : "You declined the prayer invitation.");
    } catch (invitationError) {
      setError(getActionError(invitationError));
    }
  }

  if (authLoading || loading) return <LoadingState label="Loading your schedule…" />;
  if (!user) return <Notice>Please sign in again to open your schedule.</Notice>;

  // One toast at a time: errors take priority, and form errors show inside the form instead.
  const toastError = error && !showForm ? error : "";
  const toastMessage = toastError || notice;

  return (
    <div className="min-w-0">
      <PageHeading
        eyebrow="Make time to pray"
        title="Prayer schedule"
        description="Plan a session with your group and keep the time that matters."
        action={
          <PrimaryButton
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setShowForm((value) => !value);
            }}
          >
            {showForm ? "Close form" : "Schedule prayer"}
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {showForm && (
            <div ref={formRef} className="scroll-mt-24">
              <SessionForm
                key={editing?.id || "new-session"}
                editing={editing}
                groups={groups}
                user={user}
                onError={setError}
                onSave={saveSession}
                onCancel={() => {
                  setEditing(null);
                  setShowForm(false);
                }}
                error={error}
              />
            </div>
          )}

          {sortedSessions.length === 0 ? (
            <Panel>
              <EmptyState
                title="A little time set aside can mean a lot"
                description="Create a prayer session, or join a group to see its shared schedule here."
              >
                  <PrimaryButton type="button" onClick={() => setShowForm(true)}>
                    Schedule your first prayer
                  </PrimaryButton>
              </EmptyState>
            </Panel>
          ) : (
            <div className="space-y-3">
              {sortedSessions.map((session) => {
                const isCreator = session.creatorUid === user.uid;
                const status = attendance[session.id];
                const invitationStatus = invitationStatuses[session.id];
                return (
                <Panel key={`${session.id}:${session.occurrenceIndex || 0}`} className={session.cancelled ? "opacity-65" : ""}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="min-w-0 break-words text-lg font-semibold text-slate-950">{session.title}</h2>
                          {session.cancelled && (
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                              Cancelled
                            </span>
                          )}
                          {isCreator && (
                            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                              Your session
                            </span>
                          )}
                          {session.occurrenceIndex > 0 && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              Repeat {session.occurrenceIndex + 1}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-700">
                          {formatDate(session.startsAt)} · {session.durationMinutes} minutes
                        </p>
                        {session.description && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                            {session.description}
                          </p>
                        )}
                        <p className="mt-3 break-words text-xs leading-5 text-slate-500">
                          {session.groupId
                            ? `Shared with ${groups.find((group) => group.id === session.groupId)?.name || "your prayer group"} · ${session.timeZone || "local time"}`
                            : invitationStatus
                              ? `Invitation · ${groups.find((group) => group.id === session.invitationGroupId)?.name || "your prayer group"} · ${session.timeZone || "local time"}`
                              : `Private · ${session.timeZone || "local time"}`}
                        </p>
                      </div>
                      {/* Actions: full-width, evenly sized buttons on phones; compact and right-aligned from sm up */}
                      <div className="flex flex-wrap gap-2 sm:max-w-[16rem] sm:shrink-0 sm:justify-end">
                        {(session.groupId || invitationStatus === "accepted") && !isCreator && !session.cancelled && (
                          <SecondaryButton
                            type="button"
                            className="min-h-11 flex-1 sm:flex-none"
                            onClick={() => respond(session, status === "attending" ? "declined" : "attending")}
                          >
                            {status === "attending" ? "Attending ✓" : "I’ll attend"}
                          </SecondaryButton>
                        )}
                        {invitationStatus === "pending" && !isCreator && !session.cancelled && (
                          <>
                            <SecondaryButton
                              type="button"
                              className="min-h-11 flex-1 sm:flex-none"
                              onClick={() => respondToInvitation(session, "accepted")}
                            >
                              Accept invitation
                            </SecondaryButton>
                            <button
                              type="button"
                              onClick={() => respondToInvitation(session, "declined")}
                              className="min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:flex-none"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {invitationStatus === "accepted" && !isCreator && (
                          <span className="self-center text-xs font-medium text-teal-800">Invitation accepted</span>
                        )}
                        {isCreator && !session.cancelled && (session.occurrenceIndex || 0) === 0 && (
                          <>
                            <SecondaryButton
                              type="button"
                              className="min-h-11 flex-1 sm:flex-none"
                              onClick={() => {
                                setEditing(sessions.find((entry) => entry.id === session.id) || session);
                                setShowForm(true);
                                setError("");
                              }}
                            >
                              Edit
                            </SecondaryButton>
                            <button
                              type="button"
                              onClick={() => cancelSession(session)}
                              className="min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 sm:flex-none"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>
        <aside className="min-w-0 space-y-5">
          <Panel>
            <h2 className="text-base font-semibold">Your time zone</h2>
            <p className="mt-2 text-sm text-slate-600">
              New sessions use your device time zone, <span className="font-medium">{timeZone}</span>.
              Times are stored as UTC timestamps.
            </p>
          </Panel>
          <Panel className="border-amber-100 bg-amber-50/50">
            <h2 className="text-base font-semibold text-slate-900">Shared sessions</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Repeating sessions preserve their local start time across daylight-saving changes.
              Invited guests respond from their schedule. Automated reminders still require push delivery setup.
            </p>
          </Panel>
        </aside>
      </div>
      {toastMessage && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 sm:left-auto sm:w-[420px] lg:bottom-6">
          {toastError ? <Notice>{toastError}</Notice> : <Notice tone="success">{notice}</Notice>}
        </div>
      )}
    </div>
  );
}

function mergeSessions(previous, snapshotDocs) {
  const merged = new Map(previous.map((session) => [session.id, session]));
  snapshotDocs.forEach((sessionDoc) => {
    merged.set(sessionDoc.id, { id: sessionDoc.id, ...sessionDoc.data() });
  });
  return Array.from(merged.values());
}

function expandOccurrences(session) {
  const recurrence = session.recurrence;
  if (!recurrence?.frequency || !recurrence.count || recurrence.count < 2) return [session];

  return getRecurrenceDates(
    session.startsAt.toDate(),
    recurrence,
    session.timeZone || timeZone
  ).map((occurrence, occurrenceIndex) => ({
    ...session,
    startsAt: Timestamp.fromDate(occurrence),
    occurrenceIndex
  }));
}

function SessionForm({ editing, groups, user, onSave, onCancel, onError, error }) {
  const [sharingMode, setSharingMode] = useState(editing?.groupId ? "group" : "private");
  const [selectedGroupId, setSelectedGroupId] = useState(editing?.groupId || "");
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (sharingMode !== "invite" || !selectedGroupId) return undefined;
    return onSnapshot(
      collection(db, "prayerGroups", selectedGroupId, "members"),
      (snapshot) => setMembers(snapshot.docs.map((member) => member.data()).filter((member) => member.uid !== user.uid)),
      (snapshotError) => onError(getActionError(snapshotError))
    );
  }, [onError, selectedGroupId, sharingMode, user.uid]);

  return (
    <Panel>
      <h2 className="text-lg font-semibold">{editing ? "Edit prayer session" : "Create a prayer session"}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {editing ? "Update the details for your session." : "Choose a time and, if you like, share it with one of your groups."}
      </p>
      <form onSubmit={onSave} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="session-title"
          name="title"
          label="Session title"
          required
          maxLength={100}
          defaultValue={editing?.title || ""}
          className="sm:col-span-2"
        />
        <TextAreaField
          id="session-description"
          name="description"
          label="Description (optional)"
          maxLength={1000}
          rows={3}
          defaultValue={editing?.description || ""}
          className="sm:col-span-2"
        />
        <Field
          id="session-start"
          name="startsAt"
          type="datetime-local"
          label="Starts at"
          required
          defaultValue={getDateTimeValue(editing?.startsAt)}
        />
        <SelectField
          id="session-duration"
          name="durationMinutes"
          label="Duration"
          defaultValue={String(editing?.durationMinutes || 30)}
        >
          {[15, 30, 45, 60, 90, 120, 180, 240].map((duration) => (
            <option key={duration} value={duration}>
              {duration < 60 ? `${duration} minutes` : `${duration / 60} hour${duration === 60 ? "" : "s"}`}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="session-sharing"
          name="sharingMode"
          label="Who can access it?"
          value={sharingMode}
          onChange={(event) => setSharingMode(event.target.value)}
        >
          <option value="private">Only me</option>
          <option value="group" disabled={groups.length === 0}>Share with a whole group</option>
          <option value="invite" disabled={groups.length === 0 || Boolean(editing?.groupId)}>Invite selected group members</option>
        </SelectField>
        {sharingMode !== "private" && (
          <SelectField
            id="session-group"
            name="groupId"
            label={sharingMode === "group" ? "Share with group" : "Choose invitees from"}
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
            required
          >
            <option value="">Choose a group</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </SelectField>
        )}
        {sharingMode === "invite" && selectedGroupId && (
          <fieldset className="min-w-0 space-y-2 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium text-slate-800">Select people to invite</legend>
            {members.length === 0 ? (
              <p className="text-sm text-slate-500">This group has no other members to invite.</p>
            ) : members.map((member) => (
              <label key={member.uid} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" name="inviteeUids" value={member.uid} className="size-5 shrink-0 accent-teal-800" />
                <span className="min-w-0 break-words">{member.displayName || "Group member"}</span>
              </label>
            ))}
          </fieldset>
        )}
        <SelectField
          id="session-recurrence"
          name="recurrenceFrequency"
          label="Repeat"
          defaultValue={editing?.recurrence?.frequency || "none"}
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </SelectField>
        <Field
          id="session-recurrence-count"
          name="recurrenceCount"
          type="number"
          inputMode="numeric"
          label="Occurrences, including the first"
          min={2}
          max={52}
          defaultValue={editing?.recurrence?.count || 4}
        />
        {error && <div className="sm:col-span-2"><Notice>{error}</Notice></div>}
        <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row">
          <SecondaryButton type="button" onClick={onCancel} className="w-full sm:w-auto">Cancel</SecondaryButton>
          <PrimaryButton type="submit" className="w-full sm:w-auto">{editing ? "Save changes" : "Schedule session"}</PrimaryButton>
        </div>
      </form>
    </Panel>
  );
}
