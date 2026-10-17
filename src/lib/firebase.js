import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  throw new Error(
    `Firebase client configuration is missing: ${missingKeys.join(", ")}. ` +
      "Set the corresponding NEXT_PUBLIC_FIREBASE_* values in .env.local."
  );
}

const existingApp = getApps().find((firebaseApp) => firebaseApp.name === "[DEFAULT]");
const app = existingApp || initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "default");
const storage = getStorage(app);
storage.maxUploadRetryTime = 60_000;

export { app, auth, db, storage };
export default app;

export function getFirebaseAuth() {
  return auth;
}

export function getFirebaseDb() {
  return db;
}
