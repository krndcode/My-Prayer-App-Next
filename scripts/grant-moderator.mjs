import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.argv[2];
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!uid || !projectId) {
  console.error("Usage: node scripts/grant-moderator.mjs <firebase-auth-uid>");
  console.error("Set FIREBASE_ADMIN_PROJECT_ID and configure Application Default Credentials.");
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...user.customClaims, moderator: true });
console.log(`Moderator access granted to ${user.email || uid}. The user must sign in again for the claim to take effect.`);
