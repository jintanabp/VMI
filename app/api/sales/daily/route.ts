import { NextResponse } from "next/server";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { fabricSoldHistoryReady, getSoldHistoryDirectory } from "@/lib/fabric";

/** ยอดขายรายวันย้อนหลังของสินค้า (ตามแหล่งข้อมูล from_db ของ catalog ที่ดู) */
export async function GET(request: Request) {
  const store = await getCustomerStoreFromCookie();
  if (!store) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sku = (searchParams.get("sku") ?? "").trim();
  // from_db ของ catalog ปัจจุบัน (เช่น r087) — ข้อมูลยอดขาย key ด้วยค่านี้
  const fromDb = (searchParams.get("fromDb") ?? "").trim();
  const days = Math.min(
    Math.max(Number(searchParams.get("days") ?? "7") || 7, 1),
    90
  );

  if (!sku) {
    return NextResponse.json({ error: "กรุณาระบุ sku" }, { status: 400 });
  }

  if (!fabricSoldHistoryReady()) {
    return NextResponse.json({ sku, days, available: false, summary: null });
  }

  const dir = getSoldHistoryDirectory();
  // ใช้ from_db เป็น key หลัก (fallback: รวมทุกแหล่งภายในเมธอด)
  const summary = dir.getSummary(sku, fromDb || store.code, days);

  return NextResponse.json({
    sku,
    days,
    available: true,
    lastDate: dir.lastDate,
    summary,
  });
}
