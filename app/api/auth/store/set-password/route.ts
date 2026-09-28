import { NextResponse } from "next/server";
import { claimStoreAccount } from "@/lib/auth/store-account";
import { establishStoreSession } from "@/lib/auth/store-login-helper";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/auth/rate-limit";

/**
 * จำกัดทั้งต่อ IP และต่ออีเมล — ต่ออีเมลคือตัวที่กันเดารหัสตั้งค่าจริง (เปลี่ยน IP ได้ แต่เปลี่ยนอีเมล
 * เป้าหมายไม่ได้) · 5 ครั้ง/15 นาที × 72 ชม. = เดาได้ไม่ถึง 1,500 ครั้งจาก ~8×10¹¹ แบบ
 */
const PER_EMAIL = { limit: 5, windowMs: 15 * 60 * 1000 };
const PER_IP = { limit: 20, windowMs: 15 * 60 * 1000 };

const MESSAGES: Record<string, { status: number; error: string }> = {
  not_found: { status: 400, error: "รหัสตั้งค่าไม่ถูกต้องหรือหมดอายุ — ขอรหัสใหม่จากแอดมิน" },
  bad_code: { status: 400, error: "รหัสตั้งค่าไม่ถูกต้องหรือหมดอายุ — ขอรหัสใหม่จากแอดมิน" },
  not_approved: { status: 403, error: "บัญชียังไม่ได้รับอนุมัติ" },
  already_set: { status: 409, error: "บัญชีนี้ตั้งรหัสแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน" },
  no_vda: { status: 409, error: "แอดมินยังไม่ได้กำหนด VDA ให้บัญชีนี้" },
};

/**
 * ตั้งรหัสครั้งแรกหลังได้รับอนุมัติ (หรือหลังแอดมินรีเซ็ต) แล้วล็อกอินให้เลย
 *
 * **ต้องมีรหัสตั้งค่า (setupCode) ที่แอดมินส่งให้** — เดิมรับแค่อีเมล+รหัสใหม่ ใครรู้อีเมลของบัญชีที่
 * เพิ่งสร้าง/เพิ่งรีเซ็ตก็ยึดบัญชีร้านนั้นได้ทันที (P0 จาก QA 28 ก.ย. 69)
 * อีเมลที่ไม่มีบัญชี กับรหัสผิด ตอบข้อความเดียวกัน — ไม่ให้ใช้ route นี้ไล่เดาอีเมล
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const setupCode = String(body.setupCode ?? "");

  if (!email || !setupCode) {
    return NextResponse.json(
      { error: "กรุณากรอกอีเมลและรหัสตั้งค่าที่ได้รับจากแอดมิน" },
      { status: 400 }
    );
  }

  const byIp = checkRateLimit(`store-setup-ip:${clientIp(request)}`, PER_IP);
  if (!byIp.allowed) return tooManyRequests(byIp);
  const byEmail = checkRateLimit(`store-setup-email:${email}`, PER_EMAIL);
  if (!byEmail.allowed) return tooManyRequests(byEmail);

  const result = await claimStoreAccount(email, setupCode, password);
  if (!result.ok) {
    if (result.error === "weak") {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    const m = MESSAGES[result.error] ?? MESSAGES.bad_code;
    return NextResponse.json({ error: m.error }, { status: m.status });
  }

  await establishStoreSession(result.account);
  return NextResponse.json({ success: true, vda: result.account.vdaCode });
}
