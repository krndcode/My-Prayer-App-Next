"use client";

import { useEffect } from "react";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { app } from "@/lib/firebase";

let initialized = false;

export default function FirebaseAppCheck() {
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
    if (!siteKey || initialized) return;

    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
    initialized = true;
  }, []);

  return null;
}
