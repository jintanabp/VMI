import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { buildPromoMonthReport } from "@/lib/promo/promo-month";

// อ่านจาก directory ที่ reload ตาม mtime ของ CSV — cache ไว้จะเห็นข้อมูลเก่าหลัง sync
export const dynamic = "force-dynamic";

/**
 * เดือนปัจจุบันอย่างเดียว ไม่มีพารามิเตอร์เลือกเดือน — ไฟล์ C4 ที่ sync มาถือข้อมูล
 * ของเดือนที่กำลังใช้อยู่เท่านั้น (อัปเดตเดือนละครั้ง) ถามเดือนอื่นไปก็ได้ผลว่าง
 */
export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(buildPromoMonthReport());
  } catch (err) {
    if (err instanceof Error && err.message === "PROMO_NOT_LOADED") {
      return NextResponse.json(
        { error: "Promotion master not loaded" },
        { status: 503 }
      );
    }
    throw err;
  }
}
