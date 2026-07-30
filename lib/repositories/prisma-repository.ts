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
  async createOrder(storeId, items) {
    const order = await prisma.order.create({
      data: {
        storeId,
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
          })),
        },
      },
    });
    return { id: order.id };
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
        decidedBy: actorEmail,
      },
      include: {
        store: true,
        items: { include: { sku: true } },
      },
    });
  },

  async rejectOrder(id, reason, actorEmail = "") {
    return prisma.order.update({
      where: { id },
      data: {
        status: "rejected",
        rejectReason: reason ?? null,
        decidedBy: actorEmail,
      },
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
