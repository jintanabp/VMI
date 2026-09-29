import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { isCreator } from "@/lib/auth/permissions";
import { AUDIT_ACTION_LABELS, listAuditLog } from "@/lib/admin/audit-log";

export const dynamic = "force-dynamic";

/** บันทึกการทำงานของผู้ดูแล — creator เท่านั้น (admin ห้ามเห็นว่า creator ทำอะไร และห้ามดูของกันเอง) */
export async function GET(request: Request) {
  const session = await getRawSalesSession();
  if (!isCreator(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action")?.trim() || undefined;
  if (action && !(action in AUDIT_ACTION_LABELS)) {
    return NextResponse.json({ error: "ไม่รู้จักประเภทนี้" }, { status: 400 });
  }
  // cursor ที่ไม่มีอยู่จริง (แถวถูกลบ / พิมพ์เอง) ทำให้ prisma โยน — ตอบ 400 ไม่ใช่ 500
  const result = await listAuditLog({
    q: searchParams.get("q") ?? undefined,
    action,
    afterId: searchParams.get("after")?.trim() || undefined,
  }).catch(() => null);
  if (!result) {
    return NextResponse.json({ error: "โหลดบันทึกไม่สำเร็จ — ลองค้นหาใหม่" }, { status: 400 });
  }
  return NextResponse.json(result);
}
