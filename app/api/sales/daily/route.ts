import { NextResponse } from "next/server";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { fabricSoldHistoryReady, getSoldHistoryDirectory } from "@/lib/fabric";
import {
  getVdaAosBillRegistry,
  isVdaStoreCode,
} from "@/lib/fabric/vda-aos-bill";

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

  // ร้าน VDA: sold_history key ด้วย from_db=customercode (rXXX) ไม่ใช่โค้ด vda
  // จึงต้อง map vda -> customercode(s) จาก vda_aos_bill แล้วกรองเฉพาะลูกค้าของร้านนี้
  // (ถ้ายังไม่มี mapping — เช่น vda_aos_bill ยังไม่ sync — fallback ใช้ from_db เดิม)
  let summary;
  let filteredByCustomer = false;
  if (isVdaStoreCode(store.code)) {
    const customerCodes = getVdaAosBillRegistry().getCustomerCodesForVda(
      store.code
    );
    if (customerCodes.length > 0) {
      summary = dir.getSummaryForKeys(sku, customerCodes, days);
      filteredByCustomer = true;
    }
  }
  if (!summary) {
    // ไม่ใช่ VDA หรือยังไม่มี customercode mapping — ใช้ from_db ของ catalog
    summary = dir.getSummary(sku, fromDb || store.code, days);
  }

  return NextResponse.json({
    sku,
    days,
    available: true,
    filteredByCustomer,
    lastDate: dir.lastDate,
    summary,
  });
}
