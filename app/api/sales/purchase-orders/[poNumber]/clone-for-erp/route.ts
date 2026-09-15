import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSalesSession } from "@/lib/auth/sales-session";
import { assertOrderAccess } from "@/lib/orders/access";
import { sanitizePoNumber } from "@/lib/po/po-number";
import { cloneRejectedPoForErp } from "@/lib/po/clone-for-erp";

/**
 * ขอเลขใหม่ให้ใบที่ ERP ปฏิเสธไปแล้ว (ดูเหตุผลเต็มที่ lib/po/clone-for-erp.ts)
 *
 * ใบเดิมไม่หายไปไหน — แค่ถูกปักว่า `replacedByPoNumber` ชี้มาที่ใบใหม่ ยังเปิดดูย้อนหลังได้เสมอ
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ poNumber: string }> }
) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { poNumber: raw } = await ctx.params;
  const poNumber = sanitizePoNumber(decodeURIComponent(raw));
  if (!poNumber) {
    return NextResponse.json({ error: "เลข PO ไม่ถูกต้อง" }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    select: { orderId: true },
  });
  if (!po) {
    return NextResponse.json({ error: "ไม่พบ PO" }, { status: 404 });
  }
  try {
    await assertOrderAccess(po.orderId, session);
  } catch {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ PO นี้" }, { status: 403 });
  }

  try {
    const result = await cloneRejectedPoForErp(poNumber, session.email);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    if (message === "PO_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบ PO" }, { status: 404 });
    }
    if (message === "NOT_REJECTED") {
      return NextResponse.json(
        { error: "ใบนี้ยังไม่เคยส่งไม่สำเร็จ — ไม่มีอะไรต้องขอเลขใหม่" },
        { status: 409 }
      );
    }
    if (message === "AMBIGUOUS_FAILURE") {
      return NextResponse.json(
        {
          error:
            "ผลการส่งครั้งก่อนไม่ชัดเจน (เช่น ปลายทางไม่ตอบ/เน็ตมีปัญหา) — อาจเข้าไปแล้วก็ได้ " +
            "ต้องให้คนตรวจกับ ERP ก่อนว่าใบนี้เข้าไปแล้วหรือไม่ ห้ามขอเลขใหม่เองตอนนี้",
        },
        { status: 409 }
      );
    }
    if (message === "ALREADY_SENT") {
      return NextResponse.json(
        { error: "ใบนี้ส่งเข้า ERP สำเร็จไปแล้ว ขอเลขใหม่ไม่ได้" },
        { status: 409 }
      );
    }
    if (message.startsWith("ALREADY_REPLACED:")) {
      const newNumber = message.split(":")[1];
      return NextResponse.json(
        { error: `ใบนี้เคยขอเลขใหม่ไปแล้ว — เลขใหม่คือ ${newNumber}`, replacedBy: newNumber },
        { status: 409 }
      );
    }
    if (message === "EMPTY_PO") {
      return NextResponse.json(
        { error: "ใบนี้ไม่มีรายการสินค้า" },
        { status: 409 }
      );
    }
    if (message === "RACE_LOST") {
      return NextResponse.json(
        { error: "มีคำขออื่นทำสำเร็จไปก่อนแล้ว — โหลดหน้านี้ใหม่แล้วลองอีกครั้ง" },
        { status: 409 }
      );
    }
    if (message === "NO_GROUP_KEY_AVAILABLE") {
      return NextResponse.json(
        { error: "ออเดอร์นี้มีใบย่อยเกิน 26 ใบแล้ว ขอเลขใหม่อัตโนมัติไม่ได้ — แจ้งผู้ดูแลระบบ" },
        { status: 500 }
      );
    }
    console.error(`[clone-for-erp] ${poNumber} ล้มเหลว:`, err);
    return NextResponse.json({ error: "ขอเลขใหม่ไม่สำเร็จ" }, { status: 500 });
  }
}
