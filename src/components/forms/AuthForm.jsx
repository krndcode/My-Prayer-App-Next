"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";

const COPY = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue to your prayer community.",
    submit: "Sign in",
    footer: "New to My Prayer Line?",
    footerLink: "Create an account",
    footerHref: "/register"
  },
  register: {
    title: "Create your account",
    description: "Join a community that makes space for prayer.",
    submit: "Create account",
    footer: "Already have an account?",
    footerLink: "Sign in",
    footerHref: "/login"
  },
  reset: {
    title: "Reset your password",
    description: "Enter your email and we'll send you a reset link.",
    submit: "Send reset link",
    footer: "Remembered your password?",
    footerLink: "Sign in",
    footerHref: "/login"
  }
};

function getErrorMessage(error) {
  const messages = {
    "auth/api-key-not-valid":
      "Firebase rejected the web API key. Replace NEXT_PUBLIC_FIREBASE_API_KEY in .env.local with the exact apiKey from Firebase Console → Project settings → General → Your apps. If the key is correct, check its API restrictions and allow Identity Toolkit API.",
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a little and try again.",
    "auth/weak-password": "Choose a stronger password with at least 8 characters.",
    "auth/user-disabled": "This account has been disabled. Contact support for help.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/wrong-password": "The email or password is incorrect."
  };

  if (messages[error.code]) {
    return messages[error.code];
  }

  return error.message || "Something went wrong. Please try again.";
}

async function createSession(idToken) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  const responseBody = await response.text();
  let result = null;

  if (responseBody.trim()) {
    try {
      result = JSON.parse(responseBody);
    } catch {
      throw new Error(
        `The sign-in service returned an unexpected response (HTTP ${response.status}). ` +
          "Check the Vercel deployment and function logs."
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      result?.error ||
        `Unable to create a secure session (HTTP ${response.status}). ` +
          "Check the Firebase Admin environment variables and Vercel function logs."
    );
  }

  if (result?.authenticated !== true) {
    throw new Error(
      `The sign-in service returned an empty response (HTTP ${response.status}). ` +
        "Check the Vercel deployment and function logs."
    );
  }
}

async function saveUserProfile(user) {
  const db = getFirebaseDb();
  const profileRef = doc(db, "users", user.uid);
  const profile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split("@")[0] || "Member",
    photoURL: user.photoURL
  };

  await runTransaction(db, async (transaction) => {
    const existingProfile = await transaction.get(profileRef);
    const updatedProfile = {
      ...profile,
      updatedAt: serverTimestamp()
    };

    if (existingProfile.exists()) {
      transaction.update(profileRef, updatedProfile);
      return;
    }

    transaction.set(profileRef, {
      ...updatedProfile,
      createdAt: serverTimestamp()
    });
  });
}

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = COPY[mode];

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === "register" && password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    if (mode === "register" && displayName.trim().length === 0) {
      setError("Enter your name to create an account.");
      return;
    }

    setIsSubmitting(true);

    try {
      const auth = getFirebaseAuth();

      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

        try {
          await updateProfile(credential.user, { displayName: displayName.trim() });
          await saveUserProfile(credential.user);
          await sendEmailVerification(credential.user, {
            url: `${window.location.origin}/login`
          });
        } finally {
          await signOut(auth);
        }

        setNotice("Account created. Check your email to verify your address, then sign in.");
        setPassword("");
        setConfirmPassword("");
        return;
      }

      if (mode === "reset") {
        try {
          await sendPasswordResetEmail(auth, normalizedEmail);
        } catch (resetError) {
          if (resetError.code !== "auth/user-not-found") {
            throw resetError;
          }
        }
        setNotice("If an account exists for that email, a password reset link is on its way.");
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);

      if (!credential.user.emailVerified) {
        try {
          await sendEmailVerification(credential.user, {
            url: `${window.location.origin}/login`
          });
        } finally {
          await signOut(auth);
        }
        setNotice("Please verify your email before signing in. We sent you a new verification link.");
        return;
      }

      await saveUserProfile(credential.user);
      try {
        await createSession(await credential.user.getIdToken());
      } catch (sessionError) {
        await signOut(auth);
        throw sessionError;
      }
      router.replace("/prayer");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link href="/" className="mb-12 inline-flex w-fit items-center gap-3 text-sm font-bold tracking-tight text-teal-950">
          <span className="brand-mark grid h-11 w-11 place-items-center rounded-2xl text-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8.5h14M5 15.5h14" />
            </svg>
          </span>
          My Prayer Line
        </Link>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">A quieter corner of the internet</p>
        <h2 className="mt-5 max-w-lg text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl">
          Faith grows stronger when we carry it together.
        </h2>
        <p className="mt-5 max-w-md text-base leading-7 text-slate-600">
          Find your people, make space for prayer, and celebrate the small signs of hope along the way.
        </p>
        <div className="mt-9 grid max-w-md grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/80 bg-white/65 p-4 shadow-sm backdrop-blur">
            <span className="text-xl" aria-hidden="true">✦</span>
            <p className="mt-2 text-sm font-semibold text-slate-900">A caring community</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Be heard, supported, and remembered.</p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/65 p-4 shadow-sm backdrop-blur">
            <span className="text-xl" aria-hidden="true">⌁</span>
            <p className="mt-2 text-sm font-semibold text-slate-900">Room to be present</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Make a little time for what matters.</p>
          </div>
        </div>
        <p className="mt-10 text-sm italic text-slate-600">“Where two or three gather in my name…”</p>
        <p className="mt-1 text-xs font-semibold text-teal-800">Matthew 18:20</p>
      </aside>

      <section className="auth-card w-full">
        <div className="mb-8">
          <Link href="/" className="text-sm font-semibold text-teal-800 hover:text-teal-950">
            <span aria-hidden="true">← </span>My Prayer Line
          </Link>
          <h1 className="mt-7 text-3xl font-bold tracking-[-0.04em] text-slate-950">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{copy.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
        {mode === "register" && (
          <div>
            <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-slate-800">
              Your name
            </label>
            <input
              id="displayName"
              name="name"
              autoComplete="name"
              required
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="auth-input"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-800">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="auth-input"
          />
        </div>

        {mode !== "reset" && (
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-800">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="auth-input"
            />
          </div>
        )}

        {mode === "register" && (
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-slate-800"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="auth-input"
            />
          </div>
        )}

        {mode === "login" && (
          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="text-sm font-medium text-teal-800 hover:underline">
              Forgot password?
            </Link>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-teal-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Please wait…" : copy.submit}
        </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-600">
          {copy.footer}{" "}
          <Link href={copy.footerHref} className="font-semibold text-teal-800 hover:underline">
            {copy.footerLink}
          </Link>
        </p>
      </section>
    </div>
  );
}
