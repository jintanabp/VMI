import { prisma } from "@/lib/prisma";
import { fabricMastersReady } from "@/lib/fabric";
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

  async approveOrder(id) {
    return prisma.order.update({
      where: { id },
      data: { status: "approved", approvedAt: new Date() },
      include: {
        store: true,
        items: { include: { sku: true } },
      },
    });
  },

  async rejectOrder(id, reason) {
    return prisma.order.update({
      where: { id },
      data: { status: "rejected", rejectReason: reason ?? null },
      include: {
        store: true,
        items: { include: { sku: true } },
      },
    });
  },

  async updateOrderItemQty(orderId, itemId, finalQty) {
    await prisma.orderItem.update({
      where: { id: itemId },
      data: { finalQty },
    });
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
