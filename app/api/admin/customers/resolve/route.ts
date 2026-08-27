import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { fabricMastersReady, getCustomerDirectory } from "@/lib/fabric";

export const dynamic = "force-dynamic";

const MAX_CODES = 64;

const querySchema = z.object({
  codes: z.string().trim().max(2000).default(""),
});

/**
 * รหัสลูกค้า → ชื่อบริษัท ใช้โชว์ใต้ช่องกรอกในหน้าทะเบียนคลัง VDA
 *
 * ทะเบียนคลังเป็น "เขียนอย่างเดียว" มาตลอด: พิมพ์รหัสผิดหนึ่งตัวแล้วคลังนั้นพังเงียบ ๆ
 * (ยอดขายรายวันหาย สิทธิ์เซลล์เพี้ยน) โดยหน้าเว็บไม่เคยบอกอะไรเลย
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

  const codes = parsed.data.codes
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, MAX_CODES);

  if (!fabricMastersReady()) {
    return NextResponse.json({ customers: {}, notReady: true });
  }

  const dir = getCustomerDirectory();
  const customers: Record<string, unknown> = {};
  for (const code of codes) {
    // null = หาไม่เจอจริง ๆ (ต่างจากไม่ได้ถาม) — UI เอาไปขึ้นเตือนสีเหลืองได้
    customers[code] = dir.getByCode(code);
  }

  return NextResponse.json({ customers, notReady: false });
}
