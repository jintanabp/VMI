import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { fabricMastersReady, getCustomerDirectory } from "@/lib/fabric";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * ค้นลูกค้าจาก dim_customer — ใช้ตอนแอดมินเพิ่มคลัง VDA ใหม่แล้วไม่รู้รหัสลูกค้า
 *
 * ไม่มีไฟล์ไหนในระบบบอกได้ว่า "vda6 คือบริษัทอะไร" (ชื่อใน dim_customer เป็นชื่อบริษัท
 * ไม่มีคำว่า VDA สักราย) คนที่รู้จึงต้องค้นด้วยชื่อ/จังหวัด/เลขผู้เสียภาษีเอาเอง
 *
 * directory โหลดอยู่ใน process แล้วทุก request path — ห้ามเรียก reloadFabricMasters()
 * ตรงนี้เด็ดขาด เพราะจะกลายเป็น parse ไฟล์ 69MB คาอยู่บน request ของช่องค้นหา
 */
export async function GET(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "พารามิเตอร์ไม่ถูกต้อง" }, { status: 400 });
  }
  const { q, limit } = parsed.data;

  if (!fabricMastersReady()) {
    // ต่างจาก "ไม่พบ" คนละเรื่อง — ถ้าบอกว่าไม่พบ แอดมินจะสรุปว่าบริษัทนี้ไม่มีในระบบ
    return NextResponse.json({ results: [], total: 0, capped: false, notReady: true });
  }

  // สั้นกว่า 2 ตัวอักษรคือยังพิมพ์ไม่เสร็จ ไม่ใช่คำขอที่ผิด จึงไม่ตอบ 400
  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0, capped: false, notReady: false });
  }

  const { hits, total, capped } = getCustomerDirectory().searchRanked(q, limit);
  return NextResponse.json({ results: hits, total, capped, notReady: false });
}
