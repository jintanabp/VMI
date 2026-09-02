import { NextResponse } from "next/server";
import { z } from "zod";
import { appPath } from "@/lib/paths";
import { SALES_SESSION_COOKIE } from "@/lib/auth/roles";
import { verifyMicrosoftIdToken } from "@/lib/auth/microsoft-id-token";
import { buildSalesSessionWithAccess, signSalesSession } from "@/lib/auth/sales-session";

/**
 * ตัวตนต้องมาจาก id_token ที่ตรวจลายเซ็นแล้วเท่านั้น
 *
 * เดิมรับ `{email}` จาก body ตรง ๆ แล้วเซ็น cookie ให้ — ใครยิง API ถึงและรู้อีเมล
 * ที่อยู่ใน ADMIN_EMAILS ก็ได้สิทธิ์แอดมินเต็ม โดยไม่ต้องผ่าน Microsoft เลย
 * (middleware กันแต่หน้าเว็บ ไม่ได้กัน API เส้นนี้)
 */
const bodySchema = z.object({
  idToken: z.string().trim().min(1, "ต้องมี id_token จาก Microsoft"),
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const form = await request.formData();
  return { idToken: form.get("idToken") };
}

export async function POST(request: Request) {
  const raw = await parseBody(request);
  const parsed = bodySchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ตรวจลายเซ็น + issuer + audience + วันหมดอายุ ก่อนเชื่อว่าอีเมลในนั้นเป็นของจริง
  let identity;
  try {
    identity = await verifyMicrosoftIdToken(parsed.data.idToken);
  } catch (err) {
    const message =
      err instanceof Error && err.message !== "KEY_NOT_FOUND"
        ? err.message
        : "ยืนยันตัวตนกับ Microsoft ไม่สำเร็จ — ลอง Sign in ใหม่";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  let session;
  try {
    session = await buildSalesSessionWithAccess(identity.email, identity.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ไม่มีสิทธิ์เข้าใช้งาน";
    return NextResponse.json({ error: message }, { status: 403 });
  }
  const token = signSalesSession(session);
  const redirectTo = session.role === "admin" ? "/admin" : "/sales/orders";
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const response = NextResponse.json({
      ok: true,
      user: session,
      redirectTo,
    });
    response.cookies.set(SALES_SESSION_COOKIE, token, cookieOptions());
    return response;
  }

  const response = NextResponse.redirect(
    new URL(appPath(redirectTo), request.url),
    303
  );
  response.cookies.set(SALES_SESSION_COOKIE, token, cookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SALES_SESSION_COOKIE);
  return response;
}
