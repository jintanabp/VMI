import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PKCE_COOKIE,
  STATE_COOKIE,
  buildMicrosoftAuthorizeUrl,
  createOAuthState,
  createPkcePair,
  getAzureIds,
} from "@/lib/auth/microsoft-oauth";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 10,
};

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  try {
    getAzureIds();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ตั้งค่า Azure ไม่ครบ";
    return NextResponse.redirect(
      new URL(
        `/login?mode=sales&error=${encodeURIComponent(message)}`,
        request.url
      )
    );
  }

  const state = createOAuthState();
  const { codeVerifier, codeChallenge } = createPkcePair();
  const cookieStore = await cookies();

  cookieStore.set(STATE_COOKIE, state, cookieOptions);
  cookieStore.set(PKCE_COOKIE, codeVerifier, cookieOptions);

  const authorizeUrl = buildMicrosoftAuthorizeUrl(origin, state, codeChallenge);
  return NextResponse.redirect(authorizeUrl);
}
