import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { setSalesPreviewCookie } from "@/lib/auth/sales-preview";
import { getSalesmanRegistry } from "@/lib/fabric";

export async function POST(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const email = (body.email as string)?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "กรุณาเลือกเซลล์" }, { status: 400 });
  }

  const registry = getSalesmanRegistry();
  const rep = registry.getCurrentByEmail(email);
  if (!rep?.code) {
    return NextResponse.json({ error: "ไม่พบข้อมูลเซลล์ใน master" }, { status: 404 });
  }

  await setSalesPreviewCookie({
    asEmail: rep.email,
    asCode: rep.code,
    asName: registry.getDisplayName(rep),
    divisionCode: rep.divisionCode,
  });

  return NextResponse.json({
    success: true,
    preview: {
      email: rep.email,
      code: rep.code,
      name: registry.getDisplayName(rep),
    },
  });
}
