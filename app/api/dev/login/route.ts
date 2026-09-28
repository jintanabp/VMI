import { NextResponse } from "next/server";
import { appPath } from "@/lib/paths";
import { SALES_SESSION_COOKIE } from "@/lib/auth/roles";
import { buildSalesSessionWithAccess, signSalesSession } from "@/lib/auth/sales-session";
import { homePathFor } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * ทางเข้าสำหรับ dev บนเครื่องตัวเองเท่านั้น — สร้าง sales session ตามอีเมลโดยไม่ผ่าน Microsoft
 * ใช้ทดสอบตำแหน่ง Creator / Admin / Admin+เซลล์ เมื่อ Azure ยังไม่ได้ลงทะเบียน redirect ของ localhost
 *
 * เปิดเมื่อครบทั้ง 3 ข้อเท่านั้น ไม่งั้นตอบ 404 เหมือนไม่มี route นี้:
 *   1. ไม่ใช่ production build  2. `.env` ตั้ง `DEV_LOGIN=1`  3. เรียกจาก localhost
 * สิทธิ์ยังคำนวณด้วย buildSalesSessionWithAccess ตัวจริง — ตำแหน่งที่ได้จึงตรงกับ login จริง
 *
 * GET /api/dev/login?email=someone@sahapat.co.th
 */
function devLoginEnabled(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_LOGIN !== "1") return false;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export async function GET(request: Request) {
  if (!devLoginEnabled(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "ต้องระบุ ?email=" }, { status: 400 });
  }

  let session;
  try {
    session = await buildSalesSessionWithAccess(email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ไม่มีสิทธิ์เข้าใช้งาน";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const response = NextResponse.redirect(new URL(appPath(homePathFor(session)), request.url));
  response.cookies.set(SALES_SESSION_COOKIE, signSalesSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
