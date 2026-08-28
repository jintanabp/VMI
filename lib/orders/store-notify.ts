import { prisma } from "@/lib/prisma";

/**
 * แจ้งเตือนร้านค้าเมื่อพนักงานทำอะไรกับออเดอร์
 *
 * เดิมร้านต้องเข้า /history ไปเช็คเองว่าออเดอร์ถูกอนุมัติ/ปฏิเสธหรือยัง
 * และถ้าพนักงานแก้ราคาหรือลบออเดอร์ ร้านไม่มีทางรู้เลย
 *
 * เก็บข้อความเป็น snapshot ไม่ผูก FK กับ Order เพราะออเดอร์ที่ถูกลบ
 * ก็ยังต้องแจ้งร้านให้รู้ว่าถูกลบ
 */
export type StoreNotificationKind =
  | "approved"
  | "rejected"
  | "deleted"
  | "price_changed"
  | "qty_changed"
  | "po_issued"
  // สถานะ PO เปลี่ยนหลังออกเลขแล้ว — ร้านต้องรู้ ไม่งั้นรอของที่ถูกยกเลิกไปแล้ว
  | "po_cancelled"
  | "po_received";

export async function notifyStore(args: {
  storeId: string;
  kind: StoreNotificationKind;
  title: string;
  detail?: string;
  poNumbers?: string[];
  orderId?: string | null;
  actorEmail?: string;
}): Promise<void> {
  try {
    await prisma.storeNotification.create({
      data: {
        storeId: args.storeId,
        kind: args.kind,
        title: args.title,
        detail: args.detail ?? "",
        poNumbers: (args.poNumbers ?? []).join(","),
        orderId: args.orderId ?? null,
        actorEmail: args.actorEmail ?? "",
      },
    });
  } catch (err) {
    // การแจ้งเตือนล้มเหลวต้องไม่ทำให้การอนุมัติ/ปฏิเสธล้มตาม
    console.warn("[store-notify] failed:", err);
  }
}

export interface StoreNotificationRow {
  id: string;
  kind: StoreNotificationKind;
  title: string;
  detail: string;
  poNumbers: string[];
  orderId: string | null;
  createdAt: string;
  readAt: string | null;
}

export async function listStoreNotifications(
  storeId: string,
  limit = 50
): Promise<StoreNotificationRow[]> {
  const rows = await prisma.storeNotification.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind as StoreNotificationKind,
    title: n.title,
    detail: n.detail,
    poNumbers: n.poNumbers ? n.poNumbers.split(",").filter(Boolean) : [],
    orderId: n.orderId,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  }));
}

export async function countUnreadStoreNotifications(
  storeId: string
): Promise<number> {
  return prisma.storeNotification.count({ where: { storeId, readAt: null } });
}

export async function markStoreNotificationsRead(
  storeId: string,
  ids?: string[]
): Promise<number> {
  const res = await prisma.storeNotification.updateMany({
    where: {
      storeId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return res.count;
}
