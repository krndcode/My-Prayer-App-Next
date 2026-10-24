"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  query
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updateProfile,
  verifyBeforeUpdateEmail
} from "firebase/auth";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { app, getFirebaseAuth, getFirebaseDb, storage } from "@/lib/firebase";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  Field,
  LoadingState,
  Notice,
  PageHeading,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextAreaField
} from "@/components/ui/DashboardPrimitives";

const db = getFirebaseDb();
const NOTIFICATION_DEFAULTS = {
  groupActivity: true,
  scheduleReminders: true,
  prayerEncouragement: true
};
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 1280;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const STORAGE_SETUP_MESSAGE =
  "The profile photo upload couldn't reach its Firebase Storage bucket. In Firebase Console, open Storage and select Get started, then verify NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET matches the bucket and deploy the Storage rules.";

function getError(error) {
  if (error.code === "permission-denied") return "You don't have permission to update this profile.";
  if (error.code === "storage/unauthorized") return "The profile photo upload was denied. Sign in again and retry.";
  if ([
    "storage/bucket-not-found",
    "storage/no-default-bucket",
    "storage/project-not-found",
    "storage/retry-limit-exceeded"
  ].includes(error.code)) {
    return STORAGE_SETUP_MESSAGE;
  }
  if (error.code === "storage/unknown" && /bucket|not found|cors|network/i.test(error.message || "")) {
    return STORAGE_SETUP_MESSAGE;
  }
  if (error.code === "storage/canceled") return "The profile photo upload was canceled.";
  if (error.code === "auth/requires-recent-login") return "For your security, sign in again before changing this setting.";
  return error.message || "The change could not be saved. Please try again.";
}

// Decodes the chosen file. Uses createImageBitmap when available and falls back to an <img>
// element, which older mobile browsers handle better.
async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.()
      };
    } catch {
      // fall through to the <img> fallback
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image couldn't be read. Try a different photo."));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url)
    };
  } catch (loadError) {
    URL.revokeObjectURL(url);
    throw loadError;
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function prepareAvatar(file) {
  const image = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't prepare this photo. Try another image.");
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);

    // Some browsers (notably Safari) can't encode WebP and silently return a large PNG instead.
    // In that case, encode as JPEG so the file stays small.
    let blob = await canvasToBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
    }
    if (!blob) throw new Error("Your photo couldn't be compressed. Try another image.");
    if (blob.size > MAX_AVATAR_SIZE) {
      throw new Error("This photo is still over 5 MB after resizing. Choose a smaller image.");
    }
    return blob;
  } finally {
    image.close();
  }
}

export default function ProfileWorkspace() {
  const router = useRouter();
  const { user, loading: authLoading } = useCurrentUser();
  const [profile, setProfile] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [updatingPush, setUpdatingPush] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
        setProfile(snapshot.exists() ? snapshot.data() : null);
        setLoading(false);
      },
      (snapshotError) => {
        setError(getError(snapshotError));
        setLoading(false);
      }
    );
    const stopMemberships = onSnapshot(
      query(collectionGroup(db, "members"), where("uid", "==", user.uid)),
      (snapshot) => {
        const memberships = snapshot.docs.map((membership) => ({
          id: membership.ref.parent.parent?.id,
          name: membership.data().groupName || membership.ref.parent.parent?.id,
          role: membership.data().role
        })).filter((membership) => membership.id);
        setGroups(memberships);
      },
      (snapshotError) => setError(getError(snapshotError))
    );
    return () => {
      stopProfile();
      stopMemberships();
    };
  }, [user]);

  async function saveProfile(event) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") || "").trim();
    const bio = String(form.get("bio") || "").trim();
    const phoneNumber = String(form.get("phoneNumber") || "").trim();
    if (displayName.length < 1 || displayName.length > 80) {
      setError("Your display name must be between 1 and 80 characters.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateProfile(user, { displayName });
      await user.getIdToken(true);
      await updateDoc(doc(db, "users", user.uid), {
        displayName,
        bio,
        phoneNumber,
        updatedAt: serverTimestamp()
      });
      setNotice("Your profile details were saved.");
    } catch (saveError) {
      setError(getError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!user || !file) return;

    // Some mobile browsers report an empty MIME type, so also check the file extension.
    const extension = file.name?.split(".").pop()?.toLowerCase() || "";
    const looksLikeImage =
      ALLOWED_AVATAR_TYPES.has(file.type) ||
      (!file.type && ["jpg", "jpeg", "png", "webp"].includes(extension));
    if (!looksLikeImage) {
      setError("Choose a JPEG, PNG, or WebP image. (HEIC photos need to be converted first.)");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE * 4) {
      // Large originals are fine because we resize them, but there's a sensible limit.
      setError("That photo is too large. Choose an image under 20 MB.");
      return;
    }
    if (!storage) {
      setError("Firebase Storage isn't initialised. Check the storage export in lib/firebase.js and your Firebase environment variables.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError("");
    setNotice("");
    try {
      const image = await prepareAvatar(file);
      const avatarRef = ref(storage, `users/${user.uid}/profile/avatar.webp`);
      const upload = uploadBytesResumable(avatarRef, image, { contentType: image.type || "image/webp" });
      await new Promise((resolve, reject) => {
        upload.on(
          "state_changed",
          (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          resolve
        );
      });
      const downloadURL = await getDownloadURL(avatarRef);
      // The file path never changes, so add a version marker; otherwise the browser keeps showing the old photo.
      const photoURL = `${downloadURL}${downloadURL.includes("?") ? "&" : "?"}v=${Date.now()}`;
      await updateProfile(user, { photoURL });
      await user.getIdToken(true);
      await updateDoc(doc(db, "users", user.uid), { photoURL, updatedAt: serverTimestamp() });
      setAvatarBroken(false);
      setNotice("Your profile photo was updated.");
    } catch (uploadError) {
      // The code in brackets (for example storage/unauthorized) makes problems much easier to diagnose.
      console.error("Profile photo upload failed:", uploadError);
      const code = uploadError?.code ? ` [${uploadError.code}]` : "";
      setError(`${getError(uploadError)}${code}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function changeEmail(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const newEmail = String(form.get("email") || "").trim().toLowerCase();
    if (!newEmail || newEmail === user.email?.toLowerCase()) {
      setError("Enter a different email address.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await verifyBeforeUpdateEmail(user, newEmail, { url: `${window.location.origin}/profile` });
      setNotice("Check your new email address to confirm the change. Your profile will update after verification and your next sign-in.");
      formElement.reset();
    } catch (emailError) {
      setError(getError(emailError));
    } finally {
      setSaving(false);
    }
  }

  async function sendPasswordReset() {
    if (!user?.email) return;
    setError("");
    setNotice("");
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), user.email);
      setNotice(`Password reset instructions were sent to ${user.email}.`);
    } catch (resetError) {
      setError(getError(resetError));
    }
  }

  async function togglePushNotifications() {
    if (!user) return;
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      setError("Web push is not configured yet. Add NEXT_PUBLIC_FIREBASE_VAPID_KEY from Firebase Console → Project Settings → Cloud Messaging.");
      return;
    }

    setUpdatingPush(true);
    setError("");
    setNotice("");
    try {
      if (!(await isSupported())) {
        throw new Error("This browser does not support Firebase web push notifications.");
      }
      const messaging = getMessaging(app);
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      await navigator.serviceWorker.ready;

      if (pushEnabled) {
        const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
        if (token) await deleteDoc(doc(db, "deviceTokens", token));
        await deleteToken(messaging);
        setPushEnabled(false);
        setNotice("Push notifications are disabled on this device.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error("Allow notifications in your browser settings to enable prayer updates.");
        }
        const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
        if (!token) throw new Error("The browser did not provide a push token. Try again.");
        await setDoc(doc(db, "deviceTokens", token), {
          uid: user.uid,
          token,
          updatedAt: serverTimestamp()
        });
        setPushEnabled(true);
        setNotice("Push notifications are enabled on this device.");
      }
    } catch (pushError) {
      setError(getError(pushError));
    } finally {
      setUpdatingPush(false);
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    if (!user?.email) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (!password) {
      setError("Enter your password to verify your identity.");
      return;
    }
    if (confirmation !== "DELETE") {
      setError("Type DELETE exactly to confirm account removal.");
      return;
    }

    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await user.getIdToken(true) })
      });
      const sessionResult = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(sessionResult.error || "Please sign in again.");

      const response = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Account deletion failed.");

      await getFirebaseAuth().signOut();
      router.replace("/login?accountDeleted=1");
    } catch (deleteError) {
      setError(getError(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  async function updatePreference(section, key, checked) {
    if (!user) return;
    setError("");
    setNotice("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        [`${section}.${key}`]: checked,
        updatedAt: serverTimestamp()
      });
      setNotice("Your preferences were updated.");
    } catch (preferenceError) {
      setError(getError(preferenceError));
    }
  }

  async function updateDefaultAudience(value) {
    if (!user || !["public", "private"].includes(value)) return;
    setError("");
    setNotice("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        "privacyPreferences.defaultPostAudience": value,
        updatedAt: serverTimestamp()
      });
      setNotice("Your default post audience was updated.");
    } catch (preferenceError) {
      setError(getError(preferenceError));
    }
  }

  if (authLoading || loading) return <LoadingState label="Loading your profile…" />;
  if (!user || !profile) return <Notice>Your profile could not be loaded. Please sign out and back in.</Notice>;

  const notificationPreferences = { ...NOTIFICATION_DEFAULTS, ...profile.notificationPreferences };
  const defaultPostAudience = profile.privacyPreferences?.defaultPostAudience || "public";
  const avatar = profile.photoURL || user.photoURL;
  const initials = (profile.displayName || user.email || "M").slice(0, 1).toUpperCase();

  return (
    <div className="min-w-0">
      <PageHeading
        eyebrow="Your account"
        title="Profile & preferences"
        description="Keep your details current and choose how you want to participate."
      />

      <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            <div className="flex flex-wrap items-center gap-4">
              {avatar && !avatarBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={avatar}
                  src={avatar}
                  alt=""
                  onError={() => setAvatarBroken(true)}
                  className="h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-teal-50"
                />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-teal-100 text-xl font-semibold text-teal-900 ring-4 ring-teal-50">
                  {initials}
                </span>
              )}
              <div className="min-w-0 flex-1 basis-40">
                <h2 className="truncate text-lg font-semibold">{profile.displayName || "Your profile"}</h2>
                <p className="mt-1 break-all text-sm text-slate-600">{user.email}</p>
              </div>
              <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-within:outline focus-within:outline-3 focus-within:outline-teal-500/50 sm:w-auto">
                {uploading ? `Uploading ${uploadProgress}%…` : "Change photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={uploadAvatar}
                  className="sr-only"
                  aria-label="Upload profile photo"
                />
              </label>
            </div>
            {uploading && (
              <div className="mt-4" role="status" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-teal-100">
                  <div className="h-full rounded-full bg-teal-700 transition-[width]" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-slate-500">{uploadProgress}%</p>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              JPEG, PNG, or WebP. Large photos are resized automatically.
            </p>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold">Your details</h2>
            <form onSubmit={saveProfile} className="mt-5 space-y-4">
              <Field
                id="profile-display-name"
                name="displayName"
                label="Display name"
                required
                maxLength={80}
                defaultValue={profile.displayName || user.displayName || ""}
              />
              <Field
                id="profile-phone"
                name="phoneNumber"
                label="Phone number (optional)"
                type="tel"
                autoComplete="tel"
                maxLength={32}
                defaultValue={profile.phoneNumber || ""}
              />
              <TextAreaField
                id="profile-bio"
                name="bio"
                label="A little about you (optional)"
                rows={4}
                maxLength={500}
                defaultValue={profile.bio || ""}
              />
              <PrimaryButton type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Saving…" : "Save profile"}
              </PrimaryButton>
            </form>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold">Sign-in details</h2>
            <p className="mt-1 break-all text-sm text-slate-600">
              Current email: <span className="font-medium text-slate-800">{user.email}</span>
            </p>
            <form onSubmit={changeEmail} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">New email address</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  className="auth-input"
                  placeholder="New email address"
                />
              </label>
              <SecondaryButton type="submit" disabled={saving} className="w-full sm:w-auto sm:shrink-0">
                Change email
              </SecondaryButton>
            </form>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">A verified link is required to change your email.</p>
              <SecondaryButton type="button" onClick={sendPasswordReset} className="w-full sm:w-auto sm:shrink-0">
                Send password reset link
              </SecondaryButton>
            </div>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel>
            <h2 className="text-lg font-semibold">Notification preferences</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Choose the updates you want to receive when notification delivery is enabled.
            </p>
            <div className="mt-4 space-y-3">
              <Preference
                label="Group activity"
                description="Updates from groups you belong to"
                checked={notificationPreferences.groupActivity}
                onChange={(checked) => updatePreference("notificationPreferences", "groupActivity", checked)}
              />
              <Preference
                label="Schedule reminders"
                description="Reminders for upcoming prayer sessions"
                checked={notificationPreferences.scheduleReminders}
                onChange={(checked) => updatePreference("notificationPreferences", "scheduleReminders", checked)}
              />
              <Preference
                label="Prayer encouragement"
                description="Replies and acknowledgements on your posts"
                checked={notificationPreferences.prayerEncouragement}
                onChange={(checked) => updatePreference("notificationPreferences", "prayerEncouragement", checked)}
              />
            </div>
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              Push delivery requires your browser permission and the Firebase VAPID public key. Email delivery is not configured.
            </p>
            <SecondaryButton
              type="button"
              className="mt-4 w-full"
              disabled={updatingPush}
              onClick={togglePushNotifications}
            >
              {updatingPush ? "Updating…" : pushEnabled ? "Disable push on this device" : "Enable push on this device"}
            </SecondaryButton>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold">Privacy choices</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Choose who can see new prayer requests and testimonies by default. You can still change the audience for each post.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-800">Default post audience</span>
              <select
                value={defaultPostAudience}
                onChange={(event) => updateDefaultAudience(event.target.value)}
                className="auth-input"
              >
                <option value="public">Community</option>
                <option value="private">Only me</option>
              </select>
            </label>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Your groups</h2>
                <p className="mt-1 text-sm text-slate-600">Places where you pray together.</p>
              </div>
              <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                {groups.length}
              </span>
            </div>
            {groups.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {groups.map((group) => (
                  <li key={group.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-800">{group.name}</span>
                    {group.role === "admin" && <span className="shrink-0 text-xs text-amber-700">Admin</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Join a prayer group to see it here.</p>
            )}
          </Panel>

          <Panel className="border-red-100 bg-red-50/40">
            <h2 className="text-sm font-semibold text-slate-900">Account deletion</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Deleting your account permanently removes your profile, avatar, private posts, comments, reports,
              and memberships. Shared prayer requests and testimonies remain but are anonymized. Group ownership
              transfers to the earliest remaining member; groups without other members are deleted. Your private
              sessions are deleted, and group sessions transfer to the new administrator and are cancelled.
            </p>
            <form onSubmit={deleteAccount} className="mt-4 space-y-3">
              <Field
                id="delete-account-password"
                name="password"
                label="Confirm your password"
                type="password"
                autoComplete="current-password"
                required
              />
              <Field
                id="delete-account-confirmation"
                name="confirmation"
                label='Type "DELETE" to confirm'
                autoComplete="off"
                required
              />
              <button
                type="submit"
                disabled={deleting}
                className="min-h-11 w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 sm:w-auto"
              >
                {deleting ? "Deleting account…" : "Permanently delete account"}
              </button>
            </form>
          </Panel>
        </aside>
      </div>

      {(error || notice) && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 sm:left-auto sm:w-[420px] lg:bottom-6">
          <Notice tone={error ? "error" : "success"}>{error || notice}</Notice>
        </div>
      )}
    </div>
  );
}

function Preference({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 p-3">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-teal-800"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>}
      </span>
    </label>
  );
}
