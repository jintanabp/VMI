import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  codeOnlyPreviewEmail,
  setSalesPreviewCookie,
} from "@/lib/auth/sales-preview";
import { getVdaAosBillRegistry } from "@/lib/fabric/vda-aos-bill";
import {
  getPersonSalesCodes,
  pickPrimaryCode,
  salesCodeLabel,
} from "@/lib/admin/vda-sales-directory";
import { getManualSalesmanCodes } from "@/lib/auth/manual-salesman-assignments";

function normCode(code: string) {
  return code.trim().toUpperCase();
}

/**
 * creator เปิดมุมมองทดสอบเป็นเซลล์ — ตามอีเมล (ใช้รหัสที่ผูกกับอีเมลนั้น เหมือน login จริง)
 * หรือตามรหัสอย่างเดียว (รหัสในทะเบียน VDA ที่ยังไม่มีใครผูกอีเมล) · ไม่ใช้ cross_salesman แล้ว
 */
export async function POST(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const requestedCode = (body.code as string | undefined)?.trim();

  if (requestedCode && !email) {
    const code = normCode(requestedCode);
    if (getVdaAosBillRegistry().getVdasForSalesman(code).length === 0) {
      return NextResponse.json(
        { error: "ไม่พบรหัสเซลล์นี้ในทะเบียน VDA (VDA_SALESMAN_MAP)" },
        { status: 404 }
      );
    }

    const preview = {
      asEmail: codeOnlyPreviewEmail(code),
      asCode: code,
      asName: salesCodeLabel(code),
    };
    await setSalesPreviewCookie(preview);

    return NextResponse.json({
      success: true,
      codeOnly: true,
      preview: { email: preview.asEmail, code: preview.asCode, name: preview.asName },
    });
  }

  if (!email) {
    return NextResponse.json({ error: "กรุณาเลือกเซลล์" }, { status: 400 });
  }

  const linkedCodes = await getManualSalesmanCodes(email);
  const codes = getPersonSalesCodes(email, linkedCodes);
  if (codes.length === 0) {
    return NextResponse.json(
      { error: "อีเมลนี้ยังไม่ได้ผูกกับรหัสเซลล์ — กำหนดได้ที่แท็บ «สิทธิ์เซลล์-VDA»" },
      { status: 404 }
    );
  }

  const code = requestedCode ? normCode(requestedCode) : pickPrimaryCode(linkedCodes);
  const rep = codes.find((c) => c.code === code);
  if (!rep) {
    return NextResponse.json(
      { error: "ไม่พบรหัสเซลล์นี้สำหรับอีเมลที่เลือก" },
      { status: 404 }
    );
  }

  const preview = { asEmail: email, asCode: rep.code, asName: rep.name };
  await setSalesPreviewCookie(preview);

  return NextResponse.json({
    success: true,
    codeOnly: false,
    preview: { email: preview.asEmail, code: preview.asCode, name: preview.asName },
  });
}
