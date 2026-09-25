import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSalesSession } from "@/lib/auth/sales-session";
import { resolveOrderStoreScope } from "@/lib/orders/access";
import { deleteOrdersForSession } from "@/lib/orders/delete-orders";
import { notifyStore } from "@/lib/orders/store-notify";
import { siblingRepriceAfterRemoval } from "@/lib/po/add-order-item";

export const dynamic = "force-dynamic";

/**
 * เคลียร์ SKU ตัวเดียวออกจากทุกออเดอร์ที่ยังรออนุมัติ (สิ้นเดือน) — ข้ามใบที่ออก PO แล้วเสมอ
 *
 * ต่างจาก DELETE /api/orders (ลบทั้งใบ) ตรงที่ตัวนี้ลบเฉพาะ "บรรทัด" ที่ตรง SKU
 * ข้ามออเดอร์อื่นในใบเดียวกันไว้ — ถ้าลบแล้วออเดอร์ไม่เหลือบรรทัดเลย ลบทั้งใบไปด้วย
 * (reuse deleteOrdersForSession ให้จัดการแจ้งเตือน/ไฟล์/ทรานแซกชันเหมือนลบทั้งใบปกติ)
 */
export async function DELETE(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const skuCode = params.get("skuCode")?.trim();
  // ค่าเริ่มต้นแจ้งร้าน — ร้านต้องรู้ว่าของที่สั่งหายไปจากคำสั่งซื้อ (เหมือนเคลียร์ทั้งใบ)
  const notify = params.get("notify") !== "0";
  if (!skuCode) {
    return NextResponse.json({ error: "ต้องระบุ skuCode" }, { status: 400 });
  }

  const storeScope = resolveOrderStoreScope(session);
  if (storeScope === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (storeScope === "none") {
    return NextResponse.json({ itemsRemoved: 0, ordersRemoved: 0 });
  }

  const matchingItems = await prisma.orderItem.findMany({
    where: {
      sku: { code: skuCode },
      order: {
        status: "pending_approval",
        purchaseOrders: { none: {} },
        store: storeScope,
      },
    },
    select: {
      id: true,
      orderId: true,
      c4PromoGroup: true,
      sku: { select: { name: true } },
      order: { select: { storeId: true, store: { select: { code: true } } } },
    },
  });

  if (matchingItems.length === 0) {
    return NextResponse.json({ itemsRemoved: 0, ordersRemoved: 0 });
  }

  const orderIds = [...new Set(matchingItems.map((i) => i.orderId))];
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, _count: { select: { items: true } } },
  });
  const removedCountByOrder = new Map<string, number>();
  for (const item of matchingItems) {
    removedCountByOrder.set(
      item.orderId,
      (removedCountByOrder.get(item.orderId) ?? 0) + 1
    );
  }

  // ออเดอร์ที่ลบบรรทัดนี้แล้วไม่เหลือบรรทัดใดเลย = ลบทั้งใบไปด้วย (reuse ตัวลบใบเดิม)
  const emptyOrderIds = orders
    .filter((o) => (removedCountByOrder.get(o.id) ?? 0) >= o._count.items)
    .map((o) => o.id);
  const emptyOrderIdSet = new Set(emptyOrderIds);

  // ลบทีละใบ: ลบบรรทัด + คิดโปรพี่น้องใหม่ใน transaction เดียว และเช็คซ้ำตอนลบว่าใบยังรออนุมัติ/
  // ยังไม่มี PO (อีกคนอาจอนุมัติไประหว่างที่เราอ่าน) — ใบที่ถูกตัดสินไปแล้วข้าม ไม่แตะ
  const partialByOrder = new Map<string, typeof matchingItems>();
  for (const it of matchingItems) {
    if (emptyOrderIdSet.has(it.orderId)) continue;
    partialByOrder.set(it.orderId, [...(partialByOrder.get(it.orderId) ?? []), it]);
  }
  let itemsRemoved = 0;
  for (const [orderId, lines] of partialByOrder) {
    const ids = lines.map((l) => l.id);
    const storeCode = lines[0]!.order.store.code;
    const updates = (
      await Promise.all(
        [...new Set(lines.map((l) => l.c4PromoGroup).filter((g): g is string => !!g))].map((g) =>
          siblingRepriceAfterRemoval(orderId, storeCode, g, ids, "เคลียร์สินค้าในกลุ่มโปรเดียวกันออกแล้ว")
        )
      )
    ).flat();
    const [deleted] = await prisma.$transaction([
      prisma.orderItem.deleteMany({
        where: {
          id: { in: ids },
          order: { id: orderId, status: "pending_approval", purchaseOrders: { none: {} } },
        },
      }),
      ...updates.map((u) =>
        prisma.orderItem.updateMany({
          where: { id: u.id, order: { status: "pending_approval" } },
          data: u.data,
        })
      ),
    ]);
    itemsRemoved += deleted.count;
    if (deleted.count > 0 && notify) {
      await notifyStore({
        storeId: lines[0]!.order.storeId,
        kind: "item_cleared",
        title: "เคลียร์รายการสิ้นเดือน",
        detail: `${skuCode} ${lines[0]!.sku.name} · นำออกจากคำสั่งซื้อแล้ว`,
        orderId,
        actorEmail: session.email,
      });
    }
  }

  let ordersRemoved = 0;
  if (emptyOrderIds.length > 0) {
    const result = await deleteOrdersForSession(emptyOrderIds, session, {
      allowIssuedPo: false,
      notifyStores: notify,
    });
    ordersRemoved = result.deletedOrderIds.length;
    itemsRemoved += matchingItems.filter((i) =>
      result.deletedOrderIds.includes(i.orderId)
    ).length;
  }

  return NextResponse.json({
    itemsRemoved,
    ordersRemoved,
  });
}
