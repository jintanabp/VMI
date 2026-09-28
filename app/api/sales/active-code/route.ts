import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  getRawSalesSession,
  signSalesSession,
} from "@/lib/auth/sales-session";
import { SALES_SESSION_COOKIE } from "@/lib/auth/roles";
import {
  getSalesPreview,
  setSalesPreviewCookie,
} from "@/lib/auth/sales-preview";
import { getManualSalesmanCodes } from "@/lib/auth/manual-salesman-assignments";
import { salesCodeLabel } from "@/lib/admin/vda-sales-directory";

const bodySchema = z.object({
  code: z.string().min(1),
});

function normCode(code: string) {
  return code.trim().toUpperCase();
}

/**
 * สลับรหัสเซลล์ที่ใช้อยู่ — เลือกได้เฉพาะรหัสที่ผูกกับอีเมลนั้นในหน้า «สิทธิ์เซลล์-VDA»
 * (ไม่ใช้ cross_salesman master แล้ว)
 */
export async function POST(request: Request) {
  // ตรวจตัวตนก่อนอ่าน body — เดิม parse ก่อน: ไม่มี body = 500 และคนไม่ได้ login ได้ 400 แทน 401
  const rawSession = await getRawSalesSession();
  if (!rawSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณาระบุรหัสเซลล์" }, { status: 400 });
  }

  const targetCode = normCode(parsed.data.code);
  const preview = await getSalesPreview();

  if (rawSession.role === "admin" && preview) {
    const codes = await getManualSalesmanCodes(preview.asEmail);
    if (!codes.includes(targetCode)) {
      return NextResponse.json(
        { error: "รหัสเซลล์นี้ไม่ได้ผูกกับอีเมลที่ทดสอบ" },
        { status: 400 }
      );
    }

    await setSalesPreviewCookie({
      asEmail: preview.asEmail,
      asCode: targetCode,
      asName: salesCodeLabel(targetCode),
    });

    return NextResponse.json({
      success: true,
      code: targetCode,
      name: salesCodeLabel(targetCode),
    });
  }

  if (rawSession.role !== "sales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(rawSession.manualCodes ?? []).map(normCode).includes(targetCode)) {
    return NextResponse.json(
      { error: "รหัสเซลล์นี้ไม่ตรงกับบัญชีของคุณ" },
      { status: 400 }
    );
  }

  const updated = {
    ...rawSession,
    salesmanCode: targetCode,
    salesmanName: salesCodeLabel(targetCode),
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
    code: targetCode,
    name: salesCodeLabel(targetCode),
  });
}
