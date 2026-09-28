import { NextResponse } from "next/server";
import { hasSalesView } from "@/lib/auth/permissions";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSalesSession, salesPreviewReadOnly } from "@/lib/auth/sales-session";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";

/**
 * เงื่อนไข store ที่เซลล์คนนี้ดูแล — admin เห็นทุกร้าน
 *
 * ตัดสินจาก รหัสที่ผูกกับอีเมล → VDA อย่างเดียว · เดิม OR กับ `Store.salesRep` ด้วย ซึ่งเป็นค่าที่ตั้ง
 * ตอนร้านส่งออเดอร์ (อีเมลแรกของรหัสตอนนั้น) และค้างเก่าได้ — คนที่ถูกย้ายไปรหัสอื่นยังเห็น/กดรับทราบ
 * แจ้งเตือนของ VDA เดิมแทนทุกคนต่อได้ (QA 28 ก.ย. 69) · ไม่มี VDA = ไม่เห็นอะไร (ไม่ใช่ถอยไปใช้ salesRep)
 */
function storeScopeWhere(
  session: Awaited<ReturnType<typeof getSalesSession>>
): Prisma.StoreWhereInput | null {
  if (!session) return null;
  if (session.role === "admin") return {};

  const vdas = [
    ...new Set([
      ...resolveVdaCodesForSalesmanCodes(resolveSalesmanCodesForFilter(session)),
      ...resolveAllPersonVdaCodes(session.email.toLowerCase(), session.manualCodes),
    ]),
  ];
  return { code: { in: vdas } };
}

export async function GET() {
  const session = await getSalesSession();
  if (session && !hasSalesView(session)) return NextResponse.json({ error: "บัญชีนี้ไม่ได้ผูกกับรหัสเซลล์ — ใช้ได้เฉพาะหน้าตั้งค่า" }, { status: 403 });
  const scope = storeScopeWhere(session);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // สถานะอ่านแล้วเป็นของแต่ละคน (SalesNotificationRead / StoreSkuBlockRead) — เดิมเก็บที่แถวแจ้งเตือน
  // คนหนึ่งเปิดกระดิ่ง ทุกคนใน VDA เดียวกันเห็นว่าอ่านแล้ว (QA 28 ก.ย. 69) · acknowledgedAt เดิมยังนับว่าอ่านแล้ว
  const me = session!.email.trim().toLowerCase();
  const now = new Date();

  const [blocks, orderNotifs] = await Promise.all([
    prisma.storeSkuBlock.findMany({
      // หยุดสั่งที่หมดช่วงแล้ว (effectiveTo ผ่านไปแล้ว) ไม่ต้องเตือน
      where: {
        store: { is: scope },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      include: {
        store: { select: { code: true, name: true } },
        sku: { select: { code: true, name: true } },
        reads: { where: { email: me }, select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.salesNotification.findMany({
      where: { store: { is: scope } },
      include: {
        store: { select: { code: true, name: true } },
        reads: { where: { email: me }, select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  /**
   * สถานะปัจจุบันของออเดอร์ที่ถูกแจ้ง — เดิมหน้าจอขึ้น "ออเดอร์ใหม่" พร้อมปุ่ม "ตรวจ"
   * ต่อไปเรื่อย ๆ แม้จะอนุมัติไปแล้ว เซลล์จึงกดเข้าไปดูซ้ำโดยไม่รู้ว่าจัดการไปแล้ว
   *
   * `orderId` เก็บเป็น String ไม่มี FK โดยตั้งใจ (ออเดอร์ที่ถูกลบก็ยังต้องแจ้งได้)
   * จึงต้องดึงสถานะแยก · id ที่หาไม่เจอ = ออเดอร์ถูกลบไปแล้ว
   */
  const notifOrderIds = [
    ...new Set(orderNotifs.map((n) => n.orderId).filter((id): id is string => !!id)),
  ];
  const orderStatuses = new Map(
    notifOrderIds.length > 0
      ? (
          await prisma.order.findMany({
            where: { id: { in: notifOrderIds } },
            select: { id: true, status: true },
          })
        ).map((o) => [o.id, o.status])
      : []
  );

  const orderItems = orderNotifs
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      detail: n.detail,
      orderId: n.orderId,
      storeCode: n.store.code,
      storeName: n.store.name,
      createdAt: n.createdAt.toISOString(),
      acknowledged: n.acknowledgedAt != null || n.reads.length > 0,
      /** null = ออเดอร์ถูกลบไปแล้ว */
      orderStatus: n.orderId ? (orderStatuses.get(n.orderId) ?? null) : null,
    }))
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged));

  const items = blocks
    .map((b) => ({
      id: b.id,
      storeCode: b.store.code,
      storeName: b.store.name,
      skuCode: b.sku.code,
      skuName: b.sku.name,
      reason: b.reason,
      effectiveFrom: b.effectiveFrom.toISOString(),
      createdAt: b.createdAt.toISOString(),
      acknowledged: b.acknowledgedAt != null || b.reads.length > 0,
    }))
    // ที่ยังไม่รับทราบขึ้นก่อน, ที่รับทราบแล้วไปอยู่ล่างสุด (คงลำดับ createdAt ในแต่ละกลุ่ม)
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged));

  const blockUnseen = items.filter((i) => !i.acknowledged).length;
  const orderUnseen = orderItems.filter((i) => !i.acknowledged).length;

  return NextResponse.json({
    items,
    orderItems,
    blockUnseenCount: blockUnseen,
    orderUnseenCount: orderUnseen,
    // unseenCount = รวมทั้งสองแหล่ง ให้ badge บนเมนูใช้ค่าเดียวจบ
    unseenCount: blockUnseen + orderUnseen,
  });
}

export async function POST(request: Request) {
  const session = await getSalesSession();
  const scope = storeScopeWhere(session);
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // creator ในมุมมองทดสอบเปิดกระดิ่ง = ห้ามกดรับทราบแทนเซลล์ตัวจริง
  const previewBlock = salesPreviewReadOnly(session);
  if (previewBlock) return previewBlock;

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.map((v: unknown) => String(v)).filter(Boolean)
    : [];
  // ไม่ส่ง type = "block" เพื่อให้ client เดิมที่ยิงมาแบบเก่ายังทำงานเหมือนเดิม
  const type = body.type === "order" ? "order" : "block";

  // บันทึกว่า "ฉัน" อ่านแล้วเท่านั้น — คนอื่นใน VDA เดียวกันยังเห็นเป็นยังไม่อ่าน
  // เลือกเฉพาะแถวในขอบเขต ที่ยังไม่ถูกรับทราบแบบรวม และฉันยังไม่เคยอ่าน (ไม่ส่ง ids = ทั้งหมดที่เห็น 200 แถวล่าสุด)
  const me = session!.email.trim().toLowerCase();
  const where = {
    store: { is: scope },
    acknowledgedAt: null,
    reads: { none: { email: me } },
    ...(ids.length > 0 ? { id: { in: ids } } : {}),
  };

  const targetIds =
    type === "order"
      ? (
          await prisma.salesNotification.findMany({
            where,
            select: { id: true },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        ).map((r) => r.id)
      : (
          await prisma.storeSkuBlock.findMany({
            where,
            select: { id: true },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        ).map((r) => r.id);

  if (targetIds.length > 0 && type === "order") {
    await prisma.$transaction(
      targetIds.map((notificationId) =>
        prisma.salesNotificationRead.upsert({
          where: { notificationId_email: { notificationId, email: me } },
          create: { notificationId, email: me },
          update: {},
        })
      )
    );
  } else if (targetIds.length > 0) {
    await prisma.$transaction(
      targetIds.map((blockId) =>
        prisma.storeSkuBlockRead.upsert({
          where: { blockId_email: { blockId, email: me } },
          create: { blockId, email: me },
          update: {},
        })
      )
    );
  }

  return NextResponse.json({ success: true, count: targetIds.length });
}
