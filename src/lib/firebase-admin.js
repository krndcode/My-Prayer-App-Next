import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getFirebaseAdminApp() {
  const defaultApp = getApps().find((app) => app.name === "[DEFAULT]");

  if (defaultApp) {
    return defaultApp;
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId) {
    throw new Error(
      "Firebase Admin configuration is missing. Set FIREBASE_ADMIN_PROJECT_ID or " +
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID and provide service credentials or Application Default Credentials."
    );
  }

  if (!clientEmail && !privateKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_CLIENT_EMAIL and " +
        "FIREBASE_PRIVATE_KEY, or configure GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  if (Boolean(clientEmail) !== Boolean(privateKey)) {
    throw new Error(
      "Firebase Admin service account configuration is incomplete. Set both " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or configure Application Default Credentials."
    );
  }

  const credential =
    clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : applicationDefault();

  return initializeApp({ credential, projectId });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp(), "default");
}

export function getFirebaseAdminStorage() {
  return getStorage(getFirebaseAdminApp());
}
