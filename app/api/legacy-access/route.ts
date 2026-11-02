import { NextResponse } from "next/server";
import { appPath } from "@/lib/paths";
import { LEGACY_ACCESS_COOKIE } from "@/lib/moved";

/**
 * ลิงก์ "ผู้ดูแลระบบ" บนหน้าแจ้งย้าย → ปลดหน้า login ของระบบเก่าแล้วพาไป login แบบเซลล์/แอดมิน
 * ไม่ให้สิทธิ์อะไร (ดู `legacySiteAllowed` ใน lib/moved.ts) — ตัวตนจริงยังตัดสินตอน login ตามปกติ
 */
export async function GET() {
  // Location แบบ relative โดยตั้งใจ — `new URL(path, request.url)` ได้ host ที่ Next เห็นเอง (localhost)
  // ไม่ใช่ host ที่ผู้ใช้เปิด ทดสอบแล้วเด้งข้าม host ทำให้ cookie ที่เพิ่งตั้งไม่ติดไปด้วย
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: appPath("/login/?mode=sales") },
  });
  res.cookies.set(LEGACY_ACCESS_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
