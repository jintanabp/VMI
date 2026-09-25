import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSalesSession } from "@/lib/auth/sales-session";
import { resolveOrderStoreScope } from "@/lib/orders/access";
import { deleteOrdersForSession } from "@/lib/orders/delete-orders";

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

  const skuCode = new URL(request.url).searchParams.get("skuCode")?.trim();
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
    select: { id: true, orderId: true },
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

  const partialItemIds = matchingItems
    .filter((i) => !emptyOrderIdSet.has(i.orderId))
    .map((i) => i.id);

  if (partialItemIds.length > 0) {
    await prisma.orderItem.deleteMany({ where: { id: { in: partialItemIds } } });
  }

  let ordersRemoved = 0;
  if (emptyOrderIds.length > 0) {
    const result = await deleteOrdersForSession(emptyOrderIds, session, {
      allowIssuedPo: false,
      notifyStores: false,
    });
    ordersRemoved = result.deletedOrderIds.length;
  }

  return NextResponse.json({
    itemsRemoved: matchingItems.length,
    ordersRemoved,
  });
}
