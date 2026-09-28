import { NextResponse } from "next/server";
import { appPath } from "@/lib/paths";
import { exitAdminPreview } from "@/lib/auth/admin-preview";
import { getRawSalesSession } from "@/lib/auth/sales-session";

export async function POST(request: Request) {
  // raw — ระหว่างอยู่ในมุมมองทดสอบเซลล์ session ที่ถูกสวมเป็น role sales ทำให้ออกจากโหมดดูร้านไม่ได้ (403)
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await exitAdminPreview();
  return NextResponse.redirect(new URL(appPath("/admin"), request.url), 303);
}
