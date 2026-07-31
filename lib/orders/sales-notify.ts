import { prisma } from "@/lib/prisma";

/**
 * แจ้งเตือนพนักงานขายเมื่อร้านทำอะไรกับออเดอร์
 *
 * คู่ขนานกับ lib/orders/store-notify.ts (ทิศทางตรงข้าม) — เดิมเซลล์รู้ว่ามีออเดอร์ใหม่
 * ได้จาก badge ตัวเลขบนเมนูเท่านั้น ไม่มีรายการว่าร้านไหนส่งอะไรมาเมื่อไร
 * และถ้าร้านยกเลิกเอง เซลล์ไม่มีทางรู้เลยว่าเคยมีออเดอร์นั้นอยู่
 *
 * ผูกกับ storeId ไม่ใช่ตัวเซลล์ เพราะสิทธิ์เซลล์คำนวณจาก VDA registry ตอน query
 * (storeScopeWhere ใน app/api/sales/notifications/route.ts)
 */
export type SalesNotificationKind = "order_created" | "order_cancelled";

export async function notifySales(args: {
  storeId: string;
  kind: SalesNotificationKind;
  title: string;
  detail?: string;
  orderId?: string | null;
}): Promise<void> {
  try {
    await prisma.salesNotification.create({
      data: {
        storeId: args.storeId,
        kind: args.kind,
        title: args.title,
        detail: args.detail ?? "",
        orderId: args.orderId ?? null,
      },
    });
  } catch (err) {
    // แจ้งเตือนล้มเหลวต้องไม่ทำให้การส่ง/ยกเลิกออเดอร์ล้มตาม
    console.warn("[sales-notify] failed:", err);
  }
}

export interface SalesNotificationRow {
  id: string;
  kind: SalesNotificationKind;
  title: string;
  detail: string;
  orderId: string | null;
  storeCode: string;
  storeName: string;
  createdAt: string;
  acknowledged: boolean;
}
