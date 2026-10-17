import { NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;
const AUTH_ERROR_CODES = new Set([
  "auth/argument-error",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/user-not-found",
  "auth/user-disabled"
]);

function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const host = forwardedHost || request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const requestProtocol = forwardedProtocol || new URL(request.url).protocol.slice(0, -1);

    return (
      (requestProtocol === "http" || requestProtocol === "https") &&
      originUrl.protocol === `${requestProtocol}:` &&
      originUrl.host.toLowerCase() === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  };
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.idToken !== "string" ||
    body.idToken.length === 0 ||
    body.idToken.length > 10000
  ) {
    return NextResponse.json({ error: "A valid Firebase ID token is required." }, { status: 400 });
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(body.idToken, true);

    if (decodedToken.email_verified !== true) {
      return NextResponse.json(
        { error: "Verify your email address before signing in." },
        { status: 403 }
      );
    }

    const sessionCookie = await getFirebaseAdminAuth().createSessionCookie(body.idToken, {
      expiresIn: SESSION_DURATION_MS
    });
    const response = NextResponse.json({ authenticated: true });

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, sessionCookieOptions());
    return response;
  } catch (error) {
    if (AUTH_ERROR_CODES.has(error.code)) {
      return NextResponse.json(
        { error: "Your sign-in has expired. Please sign in again." },
        { status: 401 }
      );
    }

    console.error("Unable to create the Firebase session.", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Unable to create a secure session."
            : error.message || "Unable to create a secure session."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0
  });
  return response;
}
