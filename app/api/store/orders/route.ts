import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizedStoreId } from "@/lib/auth/store-context";
import { notifySales } from "@/lib/orders/sales-notify";

export const dynamic = "force-dynamic";

const resolveStoreId = getAuthorizedStoreId;

/**
 * ร้านยกเลิกคำสั่งซื้อของตัวเอง
 *
 * ยกเลิกได้เฉพาะที่พนักงานยังไม่แตะ (`pending_approval` และยังไม่มี PO)
 * — ถ้าอนุมัติ/ออก PO ไปแล้ว เลข PO ส่งต่อฝ่ายจัดซื้อไปแล้ว ร้านยกเลิกเองไม่ได้
 * เงื่อนไขเดียวกับฝั่งพนักงานที่ DELETE /api/orders
 */
export async function DELETE(request: Request) {
  const storeId = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      storeId: true,
      status: true,
      createdAt: true,
      store: { select: { code: true, name: true } },
      items: { select: { finalQty: true } },
      _count: { select: { purchaseOrders: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  }
  // เช็คเจ้าของก่อนเสมอ — ไม่งั้นร้านอื่นเดา orderId แล้วลบข้ามร้านได้
  if (order.storeId !== storeId) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์จัดการออเดอร์นี้" },
      { status: 403 }
    );
  }
  if (order.status !== "pending_approval" || order._count.purchaseOrders > 0) {
    return NextResponse.json(
      {
        error:
          order.status === "approved"
            ? "ออเดอร์นี้อนุมัติแล้ว — ติดต่อพนักงานขายเพื่อยกเลิก"
            : order.status === "rejected"
              ? "ออเดอร์นี้ถูกปฏิเสธไปแล้ว"
              : "ออเดอร์นี้พนักงานเริ่มดำเนินการแล้ว — ติดต่อพนักงานขายเพื่อยกเลิก",
        status: order.status,
      },
      { status: 409 }
    );
  }

  const itemCount = order.items.length;
  const totalQty = order.items.reduce((s, i) => s + i.finalQty, 0);

  // OrderItem มี onDelete: Cascade อยู่แล้ว
  await prisma.order.delete({ where: { id: orderId } });

  await notifySales({
    storeId,
    kind: "order_cancelled",
    title: `${order.store.code} ยกเลิกคำสั่งซื้อเอง`,
    detail: `${itemCount} รายการ · ${totalQty} หีบ ที่ส่งเมื่อ ${order.createdAt.toLocaleString(
      "th-TH",
      { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }
    )}`,
    orderId,
  });

  return NextResponse.json({ success: true, deletedId: orderId });
}
