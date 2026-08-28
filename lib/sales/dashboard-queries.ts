import type { Prisma, PrismaClient } from "@prisma/client";
import type { RedFlagItemRow } from "./dashboard-summary";

/**
 * คิวรีของหน้าภาพรวมฝั่งเซลล์ — แยกจาก route เพื่อให้ /api/sales/pending-count
 * เรียกตัวเดียวกันได้ ตัวเลข badge กับการ์ดบนแดชบอร์ดจึงไม่มีทางเถียงกัน
 */

type Db = Pick<PrismaClient, "order" | "orderItem">;

export async function countPendingOrders(
  db: Db,
  scope: Prisma.StoreWhereInput
): Promise<{ pending: number; priceFlagged: number }> {
  const where: Prisma.OrderWhereInput = {
    status: "pending_approval",
    store: { is: scope },
  };

  const [pending, priceFlagged] = await Promise.all([
    db.order.count({ where }),
    db.order.count({
      where: { ...where, items: { some: { priceFlagged: true } } },
    }),
  ]);

  return { pending, priceFlagged };
}

/** นับออเดอร์ตามสถานะในช่วงเวลา — ใช้ index [status, createdAt] */
export async function countOrdersByStatus(
  db: Db,
  scope: Prisma.StoreWhereInput,
  since: Date
): Promise<Record<string, number>> {
  const rows = await db.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since }, store: { is: scope } },
    _count: { _all: true },
  });

  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

/**
 * บรรทัดออเดอร์ในช่วงที่ดู สำหรับคำนวณธงแดงฝั่ง JS
 *
 * เลือกเฉพาะ 3 ตัวเลขที่สูตรธงต้องใช้ + ข้อมูลร้าน — ไม่ join Sku และไม่ hydrate
 * ทั้งออเดอร์ (นั่นคือปัญหาที่ทำให้ /api/orders ใช้ทำสรุปไม่ได้)
 */
export async function listFlagInputs(
  db: Db,
  scope: Prisma.StoreWhereInput,
  since: Date,
  take = 20_000
): Promise<RedFlagItemRow[]> {
  const rows = await db.orderItem.findMany({
    where: { order: { is: { createdAt: { gte: since }, store: { is: scope } } } },
    select: {
      cvdEstimate: true,
      minDays: true,
      maxDays: true,
      order: {
        select: {
          store: { select: { id: true, code: true, name: true } },
        },
      },
    },
    take,
  });

  return rows.map((r) => ({
    storeId: r.order.store.id,
    storeCode: r.order.store.code,
    storeName: r.order.store.name,
    cvdEstimate: r.cvdEstimate,
    minDays: r.minDays,
    maxDays: r.maxDays,
  }));
}

export interface RecentDecision {
  id: string;
  status: string;
  decidedAt: Date | null;
  decidedBy: string | null;
  storeCode: string;
  storeName: string;
  itemCount: number;
}

/** ออเดอร์ที่เพิ่งถูกตัดสิน — แถบกิจกรรมล่าสุด */
export async function listRecentDecisions(
  db: Db,
  scope: Prisma.StoreWhereInput,
  take = 8
): Promise<RecentDecision[]> {
  const rows = await db.order.findMany({
    where: {
      decidedAt: { not: null },
      status: { in: ["approved", "rejected"] },
      store: { is: scope },
    },
    orderBy: { decidedAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      decidedAt: true,
      decidedBy: true,
      store: { select: { code: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    decidedAt: r.decidedAt,
    decidedBy: r.decidedBy,
    storeCode: r.store.code,
    storeName: r.store.name,
    itemCount: r._count.items,
  }));
}
