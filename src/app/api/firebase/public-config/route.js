import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };
  if (Object.values(config).some((value) => !value)) {
    return NextResponse.json({ error: "Firebase client configuration is incomplete." }, { status: 503 });
  }
  return NextResponse.json(config, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" }
  });
}
