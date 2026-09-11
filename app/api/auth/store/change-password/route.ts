import { NextResponse } from "next/server";
import { getStoreSession } from "@/lib/auth/store-session";
import {
  changeStoreAccountPassword,
  getStoreAccountByEmail,
} from "@/lib/auth/store-account";
import { establishStoreSession } from "@/lib/auth/store-login-helper";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/auth/rate-limit";

/**
 * ร้านที่ล็อกอินอยู่เปลี่ยนรหัสผ่านเอง
 *
 * **อีเมลมาจากเซสชันเท่านั้น ไม่รับจาก body** — ไม่งั้นคนที่ล็อกอินร้านหนึ่งจะยิงเปลี่ยนรหัส
 * ของอีกร้านได้ด้วยการใส่อีเมลคนอื่นลงไป
 *
 * ⚠️ ข้อจำกัดที่รู้ตัว: เซสชันของเราเป็น token ที่เซ็นด้วย HMAC ไม่มีที่เก็บฝั่งเซิร์ฟเวอร์
 * เปลี่ยนรหัสแล้ว **คุกกี้ที่ออกไปก่อนหน้าบนเครื่องอื่นยังใช้ได้จนหมดอายุ (7 วัน)**
 * จะปิดช่องนี้ต้องเก็บเวลาที่เปลี่ยนรหัสไว้ใน DB แล้วให้ตัวตรวจ token อ่าน DB ทุกคำขอ
 * ซึ่งเป็นการเปลี่ยนดีไซน์ของ auth ทั้งระบบ ไม่ใช่ของที่แถมมากับฟอร์มนี้
 */
const CHANGE_RULE = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const session = await getStoreSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  // การเดารหัสเดิมคือ oracle แบบเดียวกับหน้าล็อกอิน จึงนับด้วยกฎเดียวกัน
  const limit = checkRateLimit(
    `store-change-pw:${clientIp(request)}:${session.email}`,
    CHANGE_RULE
  );
  if (!limit.allowed) return tooManyRequests(limit);

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "กรุณากรอกทั้งรหัสเดิมและรหัสใหม่" },
      { status: 400 }
    );
  }

  const result = await changeStoreAccountPassword(
    session.email,
    currentPassword,
    newPassword
  );

  if (!result.ok) {
    switch (result.error) {
      case "not_found":
        return NextResponse.json({ error: "ไม่พบบัญชีร้านค้า" }, { status: 404 });
      case "no_password":
        return NextResponse.json(
          { error: "บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน — ออกจากระบบแล้วตั้งรหัสครั้งแรกก่อน" },
          { status: 409 }
        );
      case "wrong_current":
        // **403 ไม่ใช่ 401 โดยตั้งใจ** — `apiFetch` แปลง 401 เป็น UnauthorizedError แล้วตัวจัดการกลาง
        // เด้งไปหน้า login ทันที · ถ้าตอบ 401 ที่นี่ ร้านที่พิมพ์รหัสเดิมผิดจะถูกเตะออกจากระบบ
        // แทนที่จะเห็นข้อความว่าพิมพ์ผิด (เจอตอนกดจริงบนแอปที่ build แล้ว)
        return NextResponse.json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" }, { status: 403 });
      case "same_as_current":
        return NextResponse.json(
          { error: "รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิม" },
          { status: 400 }
        );
      case "weak":
        return NextResponse.json(
          { error: result.message ?? "รหัสผ่านใหม่ไม่ผ่านเกณฑ์" },
          { status: 400 }
        );
    }
  }

  // ต่ออายุคุกกี้ของเครื่องที่เพิ่งเปลี่ยนรหัส เพื่อไม่ให้คนที่เพิ่งยืนยันรหัสเดิมหลุดออกจากระบบ
  const fresh = await getStoreAccountByEmail(session.email);
  if (fresh) await establishStoreSession(fresh);

  return NextResponse.json({ success: true });
}
