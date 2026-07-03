import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  codeOnlyPreviewEmail,
  setSalesPreviewCookie,
} from "@/lib/auth/sales-preview";
import { getSalesmanRegistry } from "@/lib/fabric";
import { getVdaAosBillRegistry } from "@/lib/fabric/vda-aos-bill";
import { pickDefaultSalesmanAssignment } from "@/lib/admin/vda-sales-directory";

function normCode(code: string) {
  return code.trim().toUpperCase();
}

export async function POST(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const requestedCode = (body.code as string | undefined)?.trim();

  const registry = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();

  // Admin: preview by salesman code only (no email in cross_salesman yet)
  if (requestedCode && !email) {
    const code = normCode(requestedCode);
    const fromMaster = registry.getCurrentByCode(code);
    const vdas = vdaReg.getVdasForSalesman(code);

    if (!fromMaster && vdas.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบรหัสเซลล์นี้ใน vda_aos_bill" },
        { status: 404 }
      );
    }

    const preview = {
      asEmail: fromMaster?.email ?? codeOnlyPreviewEmail(code),
      asCode: code,
      asName: fromMaster
        ? registry.getDisplayName(fromMaster)
        : `รหัส ${code}`,
      divisionCode: fromMaster?.divisionCode,
    };

    await setSalesPreviewCookie(preview);

    return NextResponse.json({
      success: true,
      codeOnly: !fromMaster,
      preview: {
        email: preview.asEmail,
        code: preview.asCode,
        name: preview.asName,
      },
    });
  }

  if (!email) {
    return NextResponse.json({ error: "กรุณาเลือกเซลล์" }, { status: 400 });
  }

  const assignments = registry.getAssignmentsByEmail(email);
  if (assignments.length === 0) {
    return NextResponse.json({ error: "ไม่พบข้อมูลเซลล์ใน master" }, { status: 404 });
  }

  const rep = requestedCode
    ? assignments.find((a) => normCode(a.code) === normCode(requestedCode))
    : pickDefaultSalesmanAssignment(email) ?? assignments[0];

  if (!rep?.code) {
    return NextResponse.json(
      { error: requestedCode ? "ไม่พบรหัสเซลล์นี้สำหรับอีเมลที่เลือก" : "ไม่พบข้อมูลเซลล์" },
      { status: 404 }
    );
  }

  await setSalesPreviewCookie({
    asEmail: rep.email,
    asCode: rep.code,
    asName: registry.getDisplayName(rep),
    divisionCode: rep.divisionCode,
  });

  return NextResponse.json({
    success: true,
    codeOnly: false,
    preview: {
      email: rep.email,
      code: rep.code,
      name: registry.getDisplayName(rep),
    },
  });
}
