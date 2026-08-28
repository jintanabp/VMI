import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { STORE_SESSION_COOKIE } from "./roles";
import { getSessionSecret } from "./session-secret";

export interface StoreSession {
  email: string;
  vdaCode: string;
  storeId: string;
  canManageMinMax: boolean;
}

interface StoreSessionPayload extends StoreSession {
  exp: number;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getSecret = getSessionSecret;

export function signStoreSession(session: StoreSession): string {
  const payload: StoreSessionPayload = {
    ...session,
    exp: Date.now() + MAX_AGE_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyStoreSessionToken(
  token: string | undefined
): StoreSession | null {
  if (!token) return null;

  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expected = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    ) as StoreSessionPayload;

    if (payload.exp < Date.now()) return null;

    return {
      email: payload.email,
      vdaCode: payload.vdaCode,
      storeId: payload.storeId,
      canManageMinMax: !!payload.canManageMinMax,
    };
  } catch {
    return null;
  }
}

export async function setStoreSessionCookie(session: StoreSession) {
  const cookieStore = await cookies();
  cookieStore.set(STORE_SESSION_COOKIE, signStoreSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS / 1000,
  });
}

export async function clearStoreSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(STORE_SESSION_COOKIE);
}

/**
 * อ่านอย่างเดียว — **ห้ามลบ cookie ที่นี่**
 *
 * ฟังก์ชันนี้ถูกเรียกระหว่าง render ของ server component และ Next.js ไม่อนุญาตให้
 * แก้ cookie นอก Server Action / Route Handler จะโยน "Cookies can only be modified
 * in a Server Action or Route Handler" ออกมา = **ทุกหน้าขึ้น 500** แทนที่จะพาไป login
 *
 * เคสที่เจอจริง: token หมดอายุ, cookie เสียหาย, หรือเปลี่ยน NEXTAUTH_SECRET
 * (ซึ่งทำให้ token เดิมของ "ทุกคน" ใช้ไม่ได้พร้อมกัน)
 *
 * ไม่ลบก็ไม่เป็นไร — token ที่ verify ไม่ผ่านให้สิทธิ์อะไรไม่ได้อยู่แล้ว
 * และจะถูกเขียนทับตอน login ครั้งถัดไป
 */
export async function getStoreSession(): Promise<StoreSession | null> {
  const cookieStore = await cookies();
  return verifyStoreSessionToken(cookieStore.get(STORE_SESSION_COOKIE)?.value);
}
