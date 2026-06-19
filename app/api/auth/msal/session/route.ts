import { NextResponse } from "next/server";
import { z } from "zod";
import { SALES_SESSION_COOKIE } from "@/lib/auth/roles";
import { buildSalesSessionWithAccess, signSalesSession } from "@/lib/auth/sales-session";

const bodySchema = z.object({
  email: z.string().trim().min(1, "ต้องมีอีเมล"),
  name: z.string().optional(),
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
  return {
    email: form.get("email"),
    name: form.get("name") || undefined,
  };
}

export async function POST(request: Request) {
  const raw = await parseBody(request);
  const parsed = bodySchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let session;
  try {
    session = await buildSalesSessionWithAccess(parsed.data.email, parsed.data.name);
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

  const response = NextResponse.redirect(new URL(redirectTo, request.url), 303);
  response.cookies.set(SALES_SESSION_COOKIE, token, cookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SALES_SESSION_COOKIE);
  return response;
}
