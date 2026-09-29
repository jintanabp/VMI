import { unlink } from "fs/promises";
import { prisma } from "@/lib/prisma";
import type { SalesSession } from "@/lib/auth/sales-session";
import { assertOrderAccess } from "@/lib/orders/access";
import { notifyStore } from "@/lib/orders/store-notify";
import { recordAudit } from "@/lib/admin/audit-log";
import { sanitizePoNumber } from "@/lib/po/po-number";
import { poMayBeInErp } from "@/lib/po/po-status";

/**
 * ลบออเดอร์ทิ้งทั้งใบ — ตัวกลางของทั้งหน้าตรวจออเดอร์และหน้า PO
 *
 * "ลบ" ที่นี่แปลว่าลบทุกที่ที่ร้านค้ามองเห็น ไม่ใช่แค่แถว Order:
 *  - OrderItem / PurchaseOrder ลบตามในทรานแซกชันเดียวกัน
 *  - StoreNotification เก็บเป็น snapshot ไม่มี FK (ตั้งใจ — ดูคอมเมนต์ใน schema.prisma)
 *    ถ้าไม่ลบเอง ร้านจะเหลือแจ้งเตือน "อนุมัติแล้ว / ออก PO xxx" ค้างชี้ไปออเดอร์ที่ไม่มีแล้ว
 *  - SalesNotification ฝั่งเซลล์ก็ผูกด้วย orderId แบบเดียวกัน
 *  - ไฟล์ JSON ที่เขียนลงดิสก์ตอนอนุมัติ
 */

/**
 * เหตุผลที่ข้ามออเดอร์ใบนั้นไป — ใช้สรุปให้ผู้ใช้เห็นตอนลบหลายใบ
 * `in_erp` = มี PO ที่ส่งเข้า ERP แล้ว หรือส่งแล้วผลไม่ชัดเจน — **ห้ามลบเด็ดขาด** ไม่ว่าจะยืนยันกี่ครั้ง
 */
export type DeleteSkipReason = "not_found" | "forbidden" | "has_po" | "in_erp";

/**
 * ลบ PO ที่อยู่ใน ERP แล้ว = ฝั่งเราไม่มีหลักฐานเหลือ แต่ ERP ยังเปิดบิลอยู่ และเลข orderNo นั้นถูกล็อก
 * 6 เดือน (ดู lib/po/erp-endpoint.ts) — พบจาก QA 28 ก.ย. 69 ว่าเซลล์ลบได้ด้วย notify=0
 * (ตัวจริงย้ายไป lib/po/po-status.ts ให้หน้า PO ใช้ปิดตัวเลือกสถานะได้ด้วย)
 */
export { poMayBeInErp } from "@/lib/po/po-status";

export interface DeleteOrdersResult {
  deletedOrderIds: string[];
  deletedPoNumbers: string[];
  skipped: { orderId: string; reason: DeleteSkipReason }[];
}

/** ลบได้ครั้งละไม่เกินเท่านี้ — กันยิง query เดียวแล้วล้างทั้งฐานโดยไม่ตั้งใจ */
export const MAX_DELETE_BATCH = 200;

export async function deleteOrdersForSession(
  orderIds: string[],
  session: SalesSession,
  opts: {
    /** true = ลบออเดอร์ที่ออก PO ไปแล้วได้ (PO ทุกใบของออเดอร์นั้นจะหายตามไปด้วย) */
    allowIssuedPo: boolean;
    /** true = เขียนแจ้งเตือนใบใหม่ให้ร้านรู้ว่าถูกลบ · false = เคลียร์เงียบ ๆ */
    notifyStores: boolean;
  }
): Promise<DeleteOrdersResult> {
  const unique = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  const skipped: { orderId: string; reason: DeleteSkipReason }[] = [];
  if (unique.length === 0) {
    return { deletedOrderIds: [], deletedPoNumbers: [], skipped };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      storeId: true,
      store: { select: { code: true } },
      createdAt: true,
      _count: { select: { items: true } },
      purchaseOrders: {
        select: {
          poNumber: true,
          exportPath: true,
          erpSentAt: true,
          erpAttemptedAt: true,
          erpError: true,
          erpFailureKind: true,
        },
      },
    },
  });

  const found = new Set(orders.map((o) => o.id));
  for (const id of unique) {
    if (!found.has(id)) skipped.push({ orderId: id, reason: "not_found" });
  }

  const targets: typeof orders = [];
  for (const order of orders) {
    // สิทธิ์ตรวจทีละใบเสมอ — ชุด id มาจาก client จะเป็นของคลังไหนก็ได้
    try {
      await assertOrderAccess(order.id, session);
    } catch {
      skipped.push({ orderId: order.id, reason: "forbidden" });
      continue;
    }
    // ตรวจก่อน has_po — ต่อให้ยืนยัน "ลบพร้อม PO" ก็ห้ามถ้าใบไหนอาจอยู่ใน ERP แล้ว
    if (order.purchaseOrders.some(poMayBeInErp)) {
      skipped.push({ orderId: order.id, reason: "in_erp" });
      continue;
    }
    if (order.purchaseOrders.length > 0 && !opts.allowIssuedPo) {
      skipped.push({ orderId: order.id, reason: "has_po" });
      continue;
    }
    targets.push(order);
  }

  if (targets.length === 0) {
    return { deletedOrderIds: [], deletedPoNumbers: [], skipped };
  }

  const ids = targets.map((o) => o.id);
  const deletedPoNumbers = targets
    .flatMap((o) => o.purchaseOrders.map((p) => p.poNumber))
    .sort((a, b) => a.localeCompare(b));

  // ลบลูกเองตามลำดับแทนการพึ่ง cascade อย่างเดียว — OrderItem ชี้ไป PurchaseOrder
  // ด้วย จึงต้องไปก่อน ไม่งั้นติด FK
  await prisma.$transaction([
    prisma.storeNotification.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.salesNotification.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.purchaseOrder.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.order.deleteMany({ where: { id: { in: ids } } }),
  ]);

  // ไฟล์เอกสารลบแบบ best-effort หลัง DB ผ่านแล้ว — ไฟล์หายไม่ควรทำให้การลบล้ม
  await Promise.all(
    targets.flatMap((o) =>
      o.purchaseOrders.map(async (po) => {
        if (!po.exportPath) return;
        try {
          await unlink(po.exportPath);
        } catch {
          /* ไฟล์อาจถูกย้าย/ลบไปแล้ว */
        }
      })
    )
  );

  // บันทึกไว้ใน log ของเซิร์ฟเวอร์ทุกครั้ง — ลบแล้วแถวหายหมด ไม่เหลือหลักฐานว่าใครลบอะไร
  console.info(
    `[orders:delete] by=${session.email} role=${session.role} notify=${opts.notifyStores} ` +
      `orders=${ids.join(",")} po=${deletedPoNumbers.join(",") || "-"}`
  );
  // เก็บลงตารางด้วย — log ของ container หายเมื่อสร้างใหม่ (เดิมมีแค่บรรทัดข้างบน)
  for (const o of targets) {
    const pos = o.purchaseOrders.map((p) => p.poNumber);
    // เป้าหมายเป็นร้าน + วันที่สั่ง (+ PO ถ้ามี) — id ของออเดอร์ไม่มีใครอ่านออก และแถวก็ถูกลบไปแล้ว
    const ordered = o.createdAt.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      timeZone: "Asia/Bangkok",
    });
    await recordAudit(session, "orders.delete", `${o.store.code.toUpperCase()} · สั่ง ${ordered}`, {
      poNumbers: pos,
      notifyStore: opts.notifyStores || pos.length > 0,
    });
  }

  for (const o of targets) {
    const pos = o.purchaseOrders.map((p) => p.poNumber);
    // ร้านเคยได้แจ้งเตือน "ออก PO แล้ว" — ลบใบที่มี PO ต้องบอกร้านเสมอ ปิดแจ้งเตือนได้เฉพาะใบที่ยังไม่มี PO
    if (opts.notifyStores || pos.length > 0) {
      await notifyStore({
        storeId: o.storeId,
        kind: "deleted",
        title: "ออเดอร์ถูกลบโดยพนักงาน",
        detail:
          `ออเดอร์ ${o._count.items} รายการ ที่ส่งเมื่อ ${o.createdAt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })} ถูกลบออกจากระบบ` +
          (pos.length > 0 ? ` · PO ${pos.join(", ")} ถูกยกเลิกด้วย` : ""),
        poNumbers: pos,
        orderId: o.id,
        actorEmail: session.email,
      });
    }
  }

  return { deletedOrderIds: ids, deletedPoNumbers, skipped };
}

/**
 * เลข PO → id ออเดอร์ต้นทาง (ไม่ซ้ำ)
 *
 * ลบ PO ใบเดียว = ลบออเดอร์ต้นทางทั้งใบ ดังนั้น PO พี่น้องที่แบ่งมาจาก
 * ออเดอร์เดียวกันจะหายไปด้วยเสมอ — ฝั่ง UI ต้องบอกผู้ใช้ให้ชัดก่อนกดยืนยัน
 */
export async function resolveOrderIdsForPoNumbers(poNumbers: string[]): Promise<{
  orderIds: string[];
  /** เลขที่หาไม่เจอ (พิมพ์ผิด หรือถูกลบไปแล้ว) */
  missing: string[];
}> {
  const clean = [
    ...new Set(poNumbers.map(sanitizePoNumber).filter((n) => n.length > 0)),
  ];
  if (clean.length === 0) return { orderIds: [], missing: [] };

  const rows = await prisma.purchaseOrder.findMany({
    where: { poNumber: { in: clean } },
    select: { poNumber: true, orderId: true },
  });

  const seen = new Set(rows.map((r) => r.poNumber));
  return {
    orderIds: [...new Set(rows.map((r) => r.orderId))],
    missing: clean.filter((n) => !seen.has(n)),
  };
}
