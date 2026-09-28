import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { StoreAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STORE_SESSION_COOKIE } from "./roles";
import { getSessionSecret } from "./session-secret";

export interface StoreSession {
  email: string;
  vdaCode: string;
  storeId: string;
  canManageMinMax: boolean;
  /** `StoreAccount.sessionVersion` ตอนออก token — ไม่ตรงกับในฐานข้อมูล = token ใช้ไม่ได้ (0 = token เก่า) */
  sessionVersion?: number;
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
      sessionVersion: typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0,
    };
  } catch {
    return null;
  }
}

type AccountSnapshot = Pick<
  StoreAccount,
  "status" | "vdaCode" | "sessionVersion" | "mustSetPassword" | "passwordHash" | "canManageMinMax"
>;

/**
 * token ยังใช้ได้กับบัญชีตอนนี้หรือไม่ — แยกเป็นฟังก์ชันบริสุทธิ์ให้เทสต์ได้
 *
 * เดิมเชื่อ token ตลอด 7 วัน: บัญชีที่ถูกปฏิเสธ/ลบ/รีเซ็ตรหัส/ย้าย VDA แล้วยังใช้ต่อได้ และสิทธิ์
 * min/max ค้างตามตอน login (QA 28 ก.ย. 69) · ผ่าน = คืน session ที่สิทธิ์ min/max เป็นค่าปัจจุบัน
 */
export function reconcileStoreSession(
  session: StoreSession,
  account: AccountSnapshot | null
): StoreSession | null {
  if (!account) return null;
  if (account.status !== "approved") return null;
  if (account.mustSetPassword || !account.passwordHash) return null;
  if (account.vdaCode.trim().toLowerCase() !== session.vdaCode.trim().toLowerCase()) return null;
  if ((session.sessionVersion ?? 0) !== account.sessionVersion) return null;
  return { ...session, canManageMinMax: account.canManageMinMax };
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
  const session = verifyStoreSessionToken(cookieStore.get(STORE_SESSION_COOKIE)?.value);
  if (!session) return null;

  // query เดียวต่อ request (email เป็น unique) — ตรวจว่าบัญชียังใช้ได้ตามที่ token อ้าง
  let account: AccountSnapshot | null;
  try {
    account = await prisma.storeAccount.findUnique({
      where: { email: session.email.trim().toLowerCase() },
      select: {
        status: true,
        vdaCode: true,
        sessionVersion: true,
        mustSetPassword: true,
        passwordHash: true,
        canManageMinMax: true,
      },
    });
  } catch {
    // DB อ่านไม่ได้ชั่วคราว — อย่าเตะทุกร้านออก ใช้ token ไปก่อน (แบบเดียวกับฝั่งเซลล์)
    return session;
  }
  return reconcileStoreSession(session, account);
}
