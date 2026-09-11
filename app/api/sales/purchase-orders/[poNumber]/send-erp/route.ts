import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSalesSession } from "@/lib/auth/sales-session";
import { assertOrderAccess } from "@/lib/orders/access";
import { sanitizePoNumber } from "@/lib/po/po-number";
import { rebuildPoDocumentFromDb } from "@/lib/po/po-from-db";
import { buildErpContext } from "@/lib/po/erp-context";
import { deliverPoToErp } from "@/lib/po/erp-delivery";
import {
  erpEndpoint,
  ERP_SEND_DISABLED_REASON,
} from "@/lib/po/erp-endpoint";
import { SENT_TO_ERP, SENDING_TO_ERP } from "@/lib/po/po-status";

/**
 * ส่ง PO หนึ่งใบเข้า ERP
 *
 * ⚠️ **นี่คือ route เดียวในโปรเจกต์ที่ยิงออกไปนอกเครื่องได้** ทุกด่านกันซ้อนกันอยู่:
 *
 * 1. ต้องเป็นเซสชันเซลส์ และมีสิทธิ์ในออเดอร์ต้นทางใบนั้น (`assertOrderAccess`)
 * 2. `erpEndpoint()` ต้องไม่คืน `null` — ตอนนี้คืน `null` เสมอเพราะสวิตช์ยังปิด
 * 3. `deliverPoToErp()` ตรวจความพร้อมของใบก่อน แล้วถึงยิง
 * 4. ประทับผลด้วย compare-and-set ⇒ กดพร้อมกันสองคน ยิงจริงได้ครั้งเดียว
 *
 * **ไม่มี auto-retry และจะไม่มี** — timeout แปลว่า "อาจเข้าไปแล้ว" การยิงซ้ำคือสิ่งที่
 * ทำให้คู่ orderNo+customerCode ซ้ำ แล้วเลข PO ใบนั้นถูกล็อก 6 เดือนโดยไม่มีทางกู้คืน
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
    select: { orderId: true, erpSentAt: true },
  });
  if (!po) {
    return NextResponse.json({ error: "ไม่พบ PO" }, { status: 404 });
  }
  try {
    await assertOrderAccess(po.orderId, session);
  } catch {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่ง PO นี้" }, { status: 403 });
  }

  // เคยส่งสำเร็จไปแล้ว — ตอบก่อนถึง endpoint เพื่อไม่ให้มีทางยิงซ้ำโดยบังเอิญเลย
  if (po.erpSentAt) {
    return NextResponse.json(
      {
        error: `ใบนี้ส่งเข้า ERP ไปแล้วเมื่อ ${po.erpSentAt.toISOString()} — ส่งซ้ำไม่ได้`,
      },
      { status: 409 }
    );
  }

  const endpoint = erpEndpoint();
  if (!endpoint) {
    // 503 ไม่ใช่ 403 — ไม่ใช่เรื่องสิทธิ์ แต่เป็นความสามารถที่ยังไม่ได้เปิด
    return NextResponse.json(
      { error: ERP_SEND_DISABLED_REASON },
      { status: 503 }
    );
  }

  const doc = await rebuildPoDocumentFromDb(poNumber);
  if (!doc) {
    return NextResponse.json({ error: "ประกอบเอกสาร PO ไม่สำเร็จ" }, { status: 500 });
  }

  const erpCtx = buildErpContext({
    storeCode: doc.storeCode,
    approvedAt: doc.approvedAt,
    deliveryDate: doc.deliveryDate,
  });

  // ปักสถานะ "กำลังส่ง" ก่อนยิง เพื่อให้หน้าจอของคนอื่นเห็นว่ามีคนกำลังทำอยู่
  await prisma.purchaseOrder.updateMany({
    where: { poNumber, erpSentAt: null },
    data: { status: SENDING_TO_ERP, statusAt: new Date(), statusBy: session.email },
  });

  const outcome = await deliverPoToErp({ doc, ctx: erpCtx, endpoint });

  if (!outcome.ok) {
    // ถอยสถานะกลับจาก "กำลังส่ง" — ไม่งั้นใบค้างอยู่ในสถานะที่ไม่มีใครทำอะไรต่อ
    await prisma.purchaseOrder.updateMany({
      where: { poNumber, erpSentAt: null },
      data: { status: "issued", statusAt: new Date(), statusBy: session.email },
    });
    return NextResponse.json(
      { error: outcome.message, failure: outcome.failure },
      // not_ready = ใบนี้ยังไม่ครบ (คนแก้ได้) · ที่เหลือเป็นเรื่องปลายทาง
      { status: outcome.failure === "not_ready" ? 409 : 502 }
    );
  }

  await prisma.purchaseOrder.updateMany({
    where: { poNumber },
    data: {
      status: SENT_TO_ERP,
      statusAt: new Date(),
      statusBy: session.email,
      statusNote: "",
    },
  });

  return NextResponse.json({
    success: true,
    poNumber,
    insertedRows: outcome.insertedRows ?? null,
    sentRows: outcome.sentRows ?? null,
    // จำนวนที่ปลายทางบอกว่า insert ไม่ตรงกับที่เราส่ง = ต้องมีคนไปดู ไม่ใช่ปล่อยผ่าน
    rowsMismatch:
      outcome.insertedRows != null &&
      outcome.sentRows != null &&
      outcome.insertedRows !== outcome.sentRows,
    message: outcome.message ?? null,
  });
}
