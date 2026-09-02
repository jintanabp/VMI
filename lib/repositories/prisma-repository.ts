import { prisma } from "@/lib/prisma";
import { fabricMastersReady } from "@/lib/fabric";
import { bumpStoreDataVersion } from "@/lib/fabric/data-version";
import { mapStockRow } from "./stock-mapper";
import {
  listFabricStores,
  resolveStoreId,
  resolveStoreRecord,
} from "./store-helpers";
import type {
  OrderItemInput,
  OrderRepository,
  StockRepository,
} from "./types";

/** Prisma ใช้โค้ด P2002 เมื่อชน unique index — เช็คจากรูปร่าง ไม่ต้องดึง namespace เข้ามา */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export const prismaStockRepository: StockRepository = {
  async getStores() {
    if (fabricMastersReady()) {
      return listFabricStores();
    }
    return prisma.store.findMany({ orderBy: { code: "asc" } });
  },

  async getStoreByCode(code) {
    return resolveStoreRecord(code);
  },

  async getStoreStock(storeIdOrCode) {
    const storeId = await resolveStoreId(storeIdOrCode);
    if (!storeId) return [];

    const items = await prisma.stockItem.findMany({
      where: { storeId },
      include: {
        sku: { include: { promoTiers: { orderBy: { sortOrder: "asc" } } } },
      },
      orderBy: { sku: { code: "asc" } },
    });
    return items.map((item) => mapStockRow(storeId, item));
  },

  async updateStockThresholds(storeIdOrCode, skuId, data) {
    const storeId = await resolveStoreId(storeIdOrCode);
    if (!storeId) throw new Error("store not found");

    const minDays = data.minDays ?? 7;
    const maxDays = data.maxDays ?? 15;

    await prisma.stockItem.upsert({
      where: { storeId_skuId: { storeId, skuId } },
      update: { minDays, maxDays },
      create: {
        storeId,
        skuId,
        stock: 0,
        avgSales: 1,
        minDays,
        maxDays,
      },
    });
    bumpStoreDataVersion(storeId);
  },
};

export const prismaOrderRepository: OrderRepository = {
  /**
   * สร้างคำสั่งซื้อ — ส่งซ้ำด้วย clientRequestId เดิมจะได้ใบเดิม ไม่ใช่ใบใหม่
   *
   * เคสจริงที่กันไว้: ร้านกดปุ่มส่งสองที · เน็ตกระตุกแล้วเบราว์เซอร์ retry · กด
   * ย้อนกลับแล้วกดส่งอีกรอบ — ทั้งหมดนี้เคยได้ออเดอร์ซ้ำที่เซลล์ต้องมานั่งไล่ปฏิเสธ
   * ทีหลัง และของค้างในระบบก็ถูกนับซ้ำจนคำแนะนำครั้งถัดไปเพี้ยน
   *
   * เช็คก่อนสร้างยังชนกันได้ถ้าสอง request มาพร้อมกันจริง ๆ จึงต้องมี unique index
   * เป็นด่านสุดท้าย แล้วดักโค้ด P2002 คืนใบที่อีก request สร้างสำเร็จไปแล้ว
   */
  async createOrder(storeId, items, clientRequestId) {
    if (clientRequestId) {
      const existing = await prisma.order.findUnique({
        where: { clientRequestId },
        select: { id: true },
      });
      if (existing) return { id: existing.id, reused: true };
    }

    const data = {
      storeId,
      clientRequestId: clientRequestId ?? null,
      status: "pending_approval",
      items: {
        create: items.map((item) => ({
          skuId: item.skuId,
          suggestedQty: item.suggestedQty,
          finalQty: item.finalQty,
          cvdEstimate: item.cvdEstimate,
          minDays: item.minDays ?? null,
          maxDays: item.maxDays ?? null,
          unitPriceOverride: item.unitPriceOverride ?? null,
          c4UnitPrice: item.c4UnitPrice ?? null,
          c4DiscountBaht: item.c4DiscountBaht ?? null,
          c4DiscountPct: item.c4DiscountPct ?? null,
          c4NetUnitPrice: item.c4NetUnitPrice ?? null,
          c4PriceExpired: item.c4PriceExpired ?? null,
          priceFlagged: item.priceFlagged ?? false,
          priceFlagReason: item.priceFlagReason ?? null,
          c4PromoLabel: item.c4PromoLabel ?? null,
          c4PromoKind: item.c4PromoKind ?? null,
          c4PromoGroup: item.c4PromoGroup ?? null,
          c4PromoGroupMembers: item.c4PromoGroupMembers ?? null,
          c4PooledQty: item.c4PooledQty ?? null,
          c4FreeGoodCode: item.c4FreeGoodCode ?? null,
          c4FreeGoodName: item.c4FreeGoodName ?? null,
          c4FreeGoodQty: item.c4FreeGoodQty ?? null,
          c4FreeGoodUnit: item.c4FreeGoodUnit ?? null,
        })),
      },
    };

    try {
      const order = await prisma.order.create({ data });
      return { id: order.id, reused: false };
    } catch (err) {
      // สอง request ชนกันพอดี — อีกฝั่งสร้างสำเร็จไปแล้ว คืนใบนั้นแทนการโยน error
      if (clientRequestId && isUniqueViolation(err)) {
        const winner = await prisma.order.findUnique({
          where: { clientRequestId },
          select: { id: true },
        });
        if (winner) return { id: winner.id, reused: true };
      }
      throw err;
    }
  },

  async listOrders(filters = {}) {
    const where: {
      status?: string;
      storeId?: string;
      store?: {
        salesRepId?: string;
        code?: string | { in: string[] };
        salesRep?: { email?: { in: string[] } };
      };
    } = {};

    if (filters.status) where.status = filters.status;
    if (filters.storeId) where.storeId = filters.storeId;

    const storeWhere: NonNullable<(typeof where)["store"]> = {};

    if (filters.storeCode) {
      storeWhere.code = filters.storeCode.trim().toLowerCase();
    }

    if (filters.vdaCodes && filters.vdaCodes.length > 0) {
      storeWhere.code = {
        in: filters.vdaCodes.map((c) => c.trim().toLowerCase()),
      };
    }

    if (filters.salesRepId) {
      storeWhere.salesRepId = filters.salesRepId;
    } else if (filters.salesRepEmails && filters.salesRepEmails.length > 0) {
      storeWhere.salesRep = {
        email: { in: filters.salesRepEmails.map((e: string) => e.toLowerCase()) },
      };
    } else if (filters.salesRepEmail) {
      const rep = await prisma.salesRep.findUnique({
        where: { email: filters.salesRepEmail },
      });
      if (!rep) {
        return [];
      }
      storeWhere.salesRepId = rep.id;
    }

    if (Object.keys(storeWhere).length > 0) {
      where.store = storeWhere;
    }

    return prisma.order.findMany({
      where,
      include: {
        store: { include: { salesRep: true } },
        items: { include: { sku: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async getOrderById(id) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        store: true,
        items: { include: { sku: true } },
      },
    });
  },

  async approveOrder(id, actorEmail = "") {
    return prisma.order.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        decidedAt: new Date(),
        decidedBy: actorEmail,
      },
      include: {
        store: true,
        items: { include: { sku: true } },
      },
    });
  },

  async rejectOrder(id, reason, actorEmail = "") {
    // compare-and-set: ปฏิเสธได้เฉพาะออเดอร์ที่ยังรออนุมัติ — กัน reject ชนกับ approve
    // จนออเดอร์จบที่ approved พร้อม rejectReason (เดิม order.update ทับสถานะเสมอ)
    const res = await prisma.order.updateMany({
      where: { id, status: "pending_approval" },
      data: {
        status: "rejected",
        rejectReason: reason ?? null,
        // เดิมไม่เขียนเวลาเลย ออเดอร์ที่ถูกปฏิเสธจึงไม่มีวันเวลาให้แสดง
        decidedAt: new Date(),
        decidedBy: actorEmail,
      },
    });
    if (res.count === 0) throw new Error("ORDER_ALREADY_DECIDED");
    return prisma.order.findUnique({
      where: { id },
      include: {
        store: true,
        items: { include: { sku: true } },
      },
    });
  },

  /**
   * พนักงานตั้งราคาเอง — เขียนช่องแยกจากของร้าน และคำนวณ flag ใหม่ฝั่งเซิร์ฟเวอร์
   * ห้ามรับ priceFlagged จาก client (แนวเดียวกับตอน POST สร้างออเดอร์)
   */
  async updateOrderItemPrice(orderId, itemId, override, actorEmail) {
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      select: { c4UnitPrice: true },
    });
    if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");

    const { evaluatePriceOverride } = await import("@/lib/calculations");
    // เทียบราคาที่มีผลกับ C4 ที่แช่ไว้ตอนร้านส่ง — ไม่ใช่ราคามาสเตอร์วันนี้
    const verdict = evaluatePriceOverride({
      override,
      c4UnitPrice: item.c4UnitPrice,
      promoLoaded: true,
    });

    await prisma.orderItem.updateMany({
      where: { id: itemId, orderId },
      data: {
        salesPriceOverride: verdict.override,
        salesPriceBy: verdict.override == null ? "" : actorEmail,
        salesPriceAt: verdict.override == null ? null : new Date(),
        priceFlagged: verdict.flagged,
        priceFlagReason: verdict.reason,
      },
    });
  },

  async assignPoGroups(orderId, assignments) {
    if (assignments.length === 0) return;
    await prisma.$transaction(
      assignments.map((a) =>
        prisma.orderItem.updateMany({
          where: { id: a.itemId, orderId },
          data: { poGroup: a.poGroup },
        })
      )
    );
  },

  async createPurchaseOrders(orderId, groups) {
    await prisma.$transaction(async (tx) => {
      for (const g of groups) {
        const po = await tx.purchaseOrder.create({
          data: {
            orderId,
            poNumber: g.poNumber,
            groupKey: g.groupKey,
            priceKind: g.priceKind,
            itemCount: g.itemIds.length,
            totalQty: g.totalQty,
            totalAmount: g.totalAmount,
            exportPath: g.exportPath ?? null,
            issuedBy: g.issuedBy ?? "",
          },
        });
        await tx.orderItem.updateMany({
          where: { orderId, id: { in: g.itemIds } },
          data: { purchaseOrderId: po.id, poGroup: g.groupKey },
        });
      }
    });
  },

  async listPurchaseOrders(orderId) {
    return prisma.purchaseOrder.findMany({
      where: { orderId },
      orderBy: { groupKey: "asc" },
    });
  },

  async updateOrderItemQty(orderId, itemId, finalQty) {
    // ต้องมี orderId ใน where ด้วย — ไม่งั้นผ่าน assertOrderAccess ออเดอร์ตัวเอง
    // แล้วส่ง itemId ของออเดอร์ร้านอื่นเข้ามาแก้ได้
    // updateMany เพราะ (id, orderId) ไม่ใช่ unique key ใน Prisma
    const res = await prisma.orderItem.updateMany({
      where: { id: itemId, orderId },
      data: { finalQty },
    });
    if (res.count === 0) throw new Error("ORDER_ITEM_NOT_FOUND");
  },
};

export function getDataProvider() {
  // Phase 2: swap to FabricStockRepository when DATA_SOURCE=fabric
  return {
    stock: prismaStockRepository,
    orders: prismaOrderRepository,
  };
}

export type { OrderItemInput };
