"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import DashboardNavigation from "@/components/navigation/DashboardNavigation";
import DashboardNotifications from "@/components/navigation/DashboardNotifications";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function DashboardShell({ email, isModerator = false, children }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [error, setError] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setError("");
    setIsSigningOut(true);

    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      const result = await response.json();
      await getFirebaseAuth().signOut();

      if (!response.ok) {
        throw new Error(
          result.error || "Your local session ended, but the server session could not be cleared."
        );
      }

      router.replace("/login");
    } catch (signOutError) {
      setError(signOutError.message || "Unable to sign out completely. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  const displayName = user?.displayName || email;

  return (
    <div className="dashboard-backdrop min-h-dvh text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 pt-[env(safe-area-inset-top)] shadow-[0_4px_24px_-20px_rgba(22,50,37,0.4)] backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1440px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8">
          {/* Brand: never wraps, truncates on very small screens */}
          <Link
            href="/prayer"
            className="flex min-w-0 items-center gap-2.5 sm:gap-3"
            aria-label="My Prayer Line home"
          >
            <span className="brand-mark grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-bold text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8.5h14M5 15.5h14" />
              </svg>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate whitespace-nowrap text-sm font-bold tracking-tight text-teal-950">
                My Prayer Line
              </span>
              <span className="hidden truncate whitespace-nowrap text-xs text-slate-500 sm:block">
                A place to pray together
              </span>
            </span>
          </Link>

          {/* Actions: icons only on phones, full labels from sm up */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-5">
            <DashboardNotifications />

            <div
              title={displayName}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 p-1 sm:max-w-56 sm:pr-3"
            >
              {user?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">
                  {(displayName || "M").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden truncate text-sm font-semibold text-slate-700 sm:block">
                {displayName}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              aria-label={isSigningOut ? "Signing out" : "Sign out"}
              title="Sign out"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white/80 text-sm font-semibold whitespace-nowrap text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:opacity-60 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5 sm:hidden"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M10 12h10m0 0-3-3m3 3-3 3"
                />
              </svg>
              <span className="hidden sm:inline">{isSigningOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="mx-auto max-w-6xl px-5 pb-3 text-sm text-red-700 sm:px-8">
            {error}
          </p>
        )}
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-7 px-4 py-6 pb-28 sm:px-8 lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-9 lg:py-9 lg:pb-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Your space
            </p>
            <DashboardNavigation isModerator={isModerator} />
            <div className="dashboard-verse mt-8 rounded-3xl border border-teal-100/80 p-4">
              <p className="text-sm font-semibold text-teal-950">A moment for prayer</p>
              <p className="mt-2 text-xs leading-5 text-teal-900/75">
                Carry one another&apos;s burdens, and so fulfill the law of Christ.
              </p>
              <p className="mt-2 text-xs font-medium text-teal-800">Galatians 6:2</p>
            </div>
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 shadow-[0_-8px_30px_-24px_rgba(22,50,37,0.5)] backdrop-blur-xl lg:hidden">
        <DashboardNavigation mobile isModerator={isModerator} />
      </div>
    </div>
  );
}
