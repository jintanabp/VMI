import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { fabricSkuMasterReady, getSkuMasterDirectory } from "@/lib/fabric";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * ค้นสินค้าทั้งแคตตาล็อกจาก item_barcode_map_v2 — ใช้ตอนพนักงานเพิ่มสินค้าใหม่เข้าออเดอร์
 *
 * ต่างจากช่องค้นหาในหน้า /stock ตรงที่หน้านั้นกรองแค่ในแถวสต็อกที่โหลดมาแล้วของร้านเดียว
 * (ร้านไม่เคยสต็อก SKU นั้นจะหาไม่เจอเลย) ตัวนี้ค้นทั้ง master ไม่ผูกกับร้านไหน — เปิดให้
 * staff ทุก role ที่มี sales session ใช้ได้ (ไม่ใช่ admin-only เหมือนต้นแบบค้นลูกค้า)
 *
 * directory โหลดอยู่ใน process แล้วทุก request path — ห้ามเรียก reloadFabricMasters() ตรงนี้
 */
export async function GET(request: Request) {
  const session = await getRawSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "พารามิเตอร์ไม่ถูกต้อง" }, { status: 400 });
  }
  const { q, limit } = parsed.data;

  if (!fabricSkuMasterReady()) {
    // ต่างจาก "ไม่พบ" คนละเรื่อง — ถ้าบอกว่าไม่พบ พนักงานจะสรุปว่าสินค้านี้ไม่มีในระบบ
    return NextResponse.json({ results: [], total: 0, capped: false, notReady: true });
  }

  // สั้นกว่า 2 ตัวอักษรคือยังพิมพ์ไม่เสร็จ ไม่ใช่คำขอที่ผิด จึงไม่ตอบ 400
  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0, capped: false, notReady: false });
  }

  const { hits, total, capped } = getSkuMasterDirectory().searchRanked(q, limit);
  return NextResponse.json({ results: hits, total, capped, notReady: false });
}
