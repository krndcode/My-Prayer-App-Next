import "server-only";

import { cookies } from "next/headers";
import { getFirebaseAdminAuth } from "./firebase-admin";

export const SESSION_COOKIE_NAME = "__session";

const INVALID_SESSION_CODES = new Set([
  "auth/argument-error",
  "auth/id-token-revoked",
  "auth/invalid-session-cookie",
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/user-disabled"
]);

export async function getSessionUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    return await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch (error) {
    if (INVALID_SESSION_CODES.has(error.code)) {
      return null;
    }

    throw error;
  }
}
