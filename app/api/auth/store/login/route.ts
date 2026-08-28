import { NextResponse } from "next/server";
import { fabricStockReady } from "@/lib/fabric";
import { getStoreAccountByEmail } from "@/lib/auth/store-account";
import { verifyStorePassword } from "@/lib/auth/store-password";
import { establishStoreSession } from "@/lib/auth/store-login-helper";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/auth/rate-limit";

/** เดารหัสผ่านได้ 10 ครั้งต่อ 15 นาที ต่อคู่ IP+อีเมล */
const LOGIN_RULE = { limit: 10, windowMs: 15 * 60 * 1000 };

/** เข้าสู่ระบบด้วยอีเมล + รหัสผ่านที่ตั้งไว้ */
export async function POST(request: Request) {
  if (!fabricStockReady()) {
    return NextResponse.json(
      { error: "ยังไม่พร้อมใช้งาน — ต้อง sync stock_cover_day จาก Fabric ก่อน" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const limit = checkRateLimit(
    `store-login:${clientIp(request)}:${email}`,
    LOGIN_RULE
  );
  if (!limit.allowed) return tooManyRequests(limit);

  const account = await getStoreAccountByEmail(email);
  if (!account) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  if (account.status !== "approved") {
    return NextResponse.json(
      { error: "บัญชียังไม่ได้รับอนุมัติ", step: "pending" },
      { status: 403 }
    );
  }
  if (account.mustSetPassword || !account.passwordHash) {
    return NextResponse.json(
      { error: "กรุณาตั้งรหัสผ่านครั้งแรก", step: "set-password" },
      { status: 409 }
    );
  }

  const ok = await verifyStorePassword(password, account.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  await establishStoreSession(account);
  return NextResponse.json({ success: true, vda: account.vdaCode });
}
