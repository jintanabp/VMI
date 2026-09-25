import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthorizedStoreId } from "@/lib/auth/store-context";
import { getRepositories } from "@/lib/repositories";
import { notifySales } from "@/lib/orders/sales-notify";
import { removeRejectedAddedItem, repricePooledGroupOf } from "@/lib/po/add-order-item";

export const dynamic = "force-dynamic";

const resolveStoreId = getAuthorizedStoreId;

const patchSchema = z.object({
  orderId: z.string().min(1),
  itemId: z.string().min(1),
  action: z.enum(["confirmQtyIncrease", "rejectQtyIncrease"]),
});

/**
 * ร้านยืนยัน/ปฏิเสธจำนวนที่พนักงานเพิ่มให้เกินที่ร้านขอ (ดู updateOrderItemQty)
 *
 * ต้องเป็นออเดอร์ของร้านตัวเองเท่านั้น — เช็คเจ้าของก่อนเสมอเหมือน DELETE ด้านล่าง
 */
export async function PATCH(request: Request) {
  const storeId = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }
  const { orderId, itemId, action } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      storeId: true,
      status: true,
      store: { select: { code: true } },
      items: {
        where: { id: itemId },
        select: {
          finalQty: true,
          requestedQty: true,
          agreedQty: true,
          sku: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  }
  if (order.storeId !== storeId) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์จัดการออเดอร์นี้" }, { status: 403 });
  }
  // ออเดอร์ที่ถูกปฏิเสธ/อนุมัติไปแล้วห้ามแตะ — เดิมร้านยังกดปฏิเสธแล้วลบแถว/แก้จำนวนในใบที่
  // พนักงานปฏิเสธทั้งใบไปแล้วได้
  if (order.status !== "pending_approval") {
    return NextResponse.json(
      { error: "คำสั่งซื้อนี้ถูกดำเนินการไปแล้ว — ไม่ต้องยืนยันรายการอีก" },
      { status: 409 }
    );
  }
  const item = order.items[0];
  if (!item) {
    return NextResponse.json({ error: "ไม่พบรายการนี้ในออเดอร์" }, { status: 404 });
  }

  // requestedQty=0 = พนักงานเพิ่มสินค้าตัวนี้เข้ามาเอง ร้านไม่เคยสั่ง — ปฏิเสธแล้วลบทั้งแถว
  // ร้านยืนยันไปแล้วรอบหนึ่ง (agreedQty > 0) = ไม่ใช่ "สินค้าใหม่" แล้ว ปฏิเสธรอบหลังแค่คืนจำนวน
  const isStaffAdded = item.requestedQty === 0 && !item.agreedQty;
  const { orders } = getRepositories();
  try {
    if (action === "confirmQtyIncrease") {
      await orders.confirmQtyIncrease(orderId, itemId);
    } else if (isStaffAdded) {
      await removeRejectedAddedItem(orderId, itemId);
    } else {
      await orders.rejectQtyIncrease(orderId, itemId);
      // จำนวนกลับลง — ยอดกลุ่มโปรเปลี่ยน คิดส่วนลดทั้งกลุ่มใหม่
      await repricePooledGroupOf(orderId, itemId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "ORDER_ITEM_NOT_FOUND") {
      return NextResponse.json(
        { error: "ไม่พบรายการที่รอยืนยันนี้ — อาจถูกจัดการไปแล้ว" },
        { status: 404 }
      );
    }
    throw err;
  }

  await notifySales({
    storeId,
    kind: isStaffAdded
      ? action === "confirmQtyIncrease"
        ? "item_added_confirmed"
        : "item_added_rejected"
      : action === "confirmQtyIncrease"
        ? "qty_increase_confirmed"
        : "qty_increase_rejected",
    title:
      action === "confirmQtyIncrease"
        ? isStaffAdded
          ? `${order.store.code} ยืนยันสินค้าที่เพิ่มแล้ว`
          : `${order.store.code} ยืนยันเพิ่มจำนวนแล้ว`
        : isStaffAdded
          ? `${order.store.code} ปฏิเสธสินค้าที่เพิ่ม`
          : `${order.store.code} ปฏิเสธจำนวนที่เพิ่ม`,
    detail:
      `${item.sku.code} ${item.sku.name}` +
      (action === "confirmQtyIncrease"
        ? ` · ${item.finalQty} หีบ`
        : isStaffAdded
          ? " · เอาออกจากออเดอร์แล้ว"
          : ` · กลับไปเป็น ${item.agreedQty ?? item.requestedQty ?? item.finalQty} หีบ`),
    orderId,
  });

  return NextResponse.json({
    success: true,
    staffAdded: isStaffAdded,
    removed: action === "rejectQtyIncrease" && isStaffAdded,
  });
}

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
