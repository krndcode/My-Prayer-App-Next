"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getFirebaseDb } from "@/lib/firebase";

const db = getFirebaseDb();

function getDestination(notification) {
  if (notification.type === "call-invitation") return "/calls";
  if (notification.type === "schedule-reminder" || notification.type === "schedule-invitation") {
    return "/schedule";
  }
  return "/prayer";
}

export default function DashboardNotifications() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      query(
        collection(db, "notifications"),
        where("uid", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(8)
      ),
      (snapshot) => {
        setNotifications(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setError("");
      },
      (snapshotError) => setError(snapshotError.message || "Notifications could not be loaded.")
    );
  }, [user]);

  async function openNotification(notification) {
    setError("");
    try {
      if (!notification.readAt) {
        await updateDoc(doc(db, "notifications", notification.id), { readAt: serverTimestamp() });
      }
      setOpen(false);
      router.push(getDestination(notification));
    } catch (updateError) {
      setError(updateError.message || "This notification could not be opened.");
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((current) => !current)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(90vw,360px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">×</button>
          </div>
          {error && <p role="alert" className="m-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">{error}</p>}
          {notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`w-full rounded-xl p-3 text-left hover:bg-slate-50 ${notification.readAt ? "" : "bg-teal-50/70"}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{notification.title || "Community update"}</span>
                      {!notification.readAt && <span aria-label="Unread" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-700" />}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{notification.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
