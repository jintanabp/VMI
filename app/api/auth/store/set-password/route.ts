import { NextResponse } from "next/server";
import { fabricStockReady } from "@/lib/fabric";
import {
  getStoreAccountByEmail,
  setStoreAccountPassword,
} from "@/lib/auth/store-account";
import { validatePasswordStrength } from "@/lib/auth/store-password";
import { establishStoreSession } from "@/lib/auth/store-login-helper";

/** ตั้งรหัสครั้งแรกหลังได้รับอนุมัติ แล้วล็อกอินให้เลย */
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

  const account = await getStoreAccountByEmail(email);
  if (!account) {
    return NextResponse.json({ error: "ไม่พบบัญชีร้านค้า" }, { status: 404 });
  }
  if (account.status !== "approved") {
    return NextResponse.json({ error: "บัญชียังไม่ได้รับอนุมัติ" }, { status: 403 });
  }
  if (!account.mustSetPassword && account.passwordHash) {
    return NextResponse.json(
      { error: "บัญชีนี้ตั้งรหัสแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน" },
      { status: 409 }
    );
  }
  if (!account.vdaCode) {
    return NextResponse.json(
      { error: "แอดมินยังไม่ได้กำหนด VDA ให้บัญชีนี้" },
      { status: 409 }
    );
  }

  const weak = validatePasswordStrength(password);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  const updated = await setStoreAccountPassword(email, password);
  await establishStoreSession(updated);

  return NextResponse.json({ success: true, vda: updated.vdaCode });
}
