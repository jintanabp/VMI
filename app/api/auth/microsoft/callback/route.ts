import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SALES_SESSION_COOKIE } from "@/lib/auth/roles";
import {
  PKCE_COOKIE,
  STATE_COOKIE,
  exchangeMicrosoftCode,
  parseMicrosoftIdToken,
} from "@/lib/auth/microsoft-oauth";
import { buildSalesSessionWithAccess, signSalesSession } from "@/lib/auth/sales-session";

function loginErrorRedirect(request: Request, message: string) {
  return NextResponse.redirect(
    new URL(
      `/login?mode=sales&error=${encodeURIComponent(message)}`,
      request.url
    )
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const azureError =
    url.searchParams.get("error_description") ??
    url.searchParams.get("error");

  if (azureError) {
    return loginErrorRedirect(request, azureError);
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(PKCE_COOKIE)?.value;

  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(PKCE_COOKIE);

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return loginErrorRedirect(
      request,
      "การยืนยันตัวตนไม่สำเร็จ — ลอง Sign in ใหม่"
    );
  }

  try {
    const { idToken } = await exchangeMicrosoftCode(
      code,
      origin,
      codeVerifier
    );
    const { email, name } = parseMicrosoftIdToken(idToken);
    const session = await buildSalesSessionWithAccess(email, name);
    const token = signSalesSession(session);
    const nextPath =
      session.role === "admin" ? "/admin" : "/sales/orders";

    const response = NextResponse.redirect(new URL(nextPath, request.url));
    response.cookies.set(SALES_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "เข้าสู่ระบบ Microsoft ไม่สำเร็จ";
    return loginErrorRedirect(request, message);
  }
}
