import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSalesmanRegistry } from "@/lib/fabric";
import {
  getRawSalesSession,
  signSalesSession,
} from "@/lib/auth/sales-session";
import { SALES_SESSION_COOKIE } from "@/lib/auth/roles";
import {
  getSalesPreview,
  setSalesPreviewCookie,
} from "@/lib/auth/sales-preview";

const bodySchema = z.object({
  code: z.string().min(1),
});

function normCode(code: string) {
  return code.trim().toUpperCase();
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณาระบุรหัสเซลล์" }, { status: 400 });
  }

  const rawSession = await getRawSalesSession();
  if (!rawSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetCode = normCode(parsed.data.code);
  const registry = getSalesmanRegistry();
  const preview = await getSalesPreview();

  if (rawSession.role === "admin" && preview) {
    const assignments = registry.getAssignmentsByEmail(preview.asEmail);
    const picked = assignments.find((a) => normCode(a.code) === targetCode);
    if (!picked) {
      return NextResponse.json(
        { error: "รหัสเซลล์นี้ไม่ตรงกับอีเมลที่ทดสอบ" },
        { status: 400 }
      );
    }

    await setSalesPreviewCookie({
      asEmail: picked.email,
      asCode: picked.code,
      asName: registry.getDisplayName(picked),
      divisionCode: picked.divisionCode,
    });

    return NextResponse.json({
      success: true,
      code: picked.code,
      name: registry.getDisplayName(picked),
    });
  }

  if (rawSession.role !== "sales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignments = registry.getAssignmentsByEmail(rawSession.email);
  const picked = assignments.find((a) => normCode(a.code) === targetCode);
  if (!picked) {
    return NextResponse.json(
      { error: "รหัสเซลล์นี้ไม่ตรงกับบัญชีของคุณ" },
      { status: 400 }
    );
  }

  const updated = {
    ...rawSession,
    salesmanCode: picked.code,
    salesmanName: registry.getDisplayName(picked),
    employeeNo: picked.employeeNo,
    divisionCode: picked.divisionCode,
  };

  const cookieStore = await cookies();
  cookieStore.set(SALES_SESSION_COOKIE, signSalesSession(updated), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({
    success: true,
    code: picked.code,
    name: registry.getDisplayName(picked),
  });
}
