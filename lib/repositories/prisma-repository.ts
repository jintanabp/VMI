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
  async createOrder(storeId, items, clientRequestId, deliveryDate) {
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
      // เก็บเป็นเที่ยงคืนเวลาไทย (UTC+7) ⇒ 17:00Z ของวันก่อนหน้า — ตรงกับที่ปลายทางรับเป็น DATE
      // ใช้ Date.parse บนสตริงที่ระบุโซนชัดเจน ไม่ปล่อยให้ขึ้นกับโซนของเครื่องที่รัน
      deliveryDate: deliveryDate ? new Date(`${deliveryDate}T00:00:00+07:00`) : null,
      items: {
        create: items.map((item) => ({
          skuId: item.skuId,
          suggestedQty: item.suggestedQty,
          finalQty: item.finalQty,
          // แช่จำนวนที่ร้านส่งมาตอนแรกไว้ ไม่แก้อีก — ใช้เทียบว่าพนักงานแก้จำนวนไปจากนี้ไหม
          requestedQty: item.finalQty,
          // ร้านตกลงจำนวนนี้แล้วตอนกดส่ง — เส้นฐานของ "เพิ่มเกินต้องรอยืนยัน"
          agreedQty: item.finalQty,
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
          discountFlagged: item.discountFlagged ?? false,
          discountFlagReason: item.discountFlagReason ?? null,
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

  /**
   * แก้จำนวน — ถ้าพนักงานตั้งมากกว่าจำนวนล่าสุดที่ร้านตกลงแล้ว (agreedQty) ต้องรอร้านยืนยันก่อน
   * ถึงจะเอาเข้า PO ได้ (ลดได้เลยไม่ต้องรอ ตามที่ผู้ใช้ระบุ) — คืนค่า pendingConfirm ให้ route
   * ตัดสินใจว่าจะแจ้งเตือนร้านแบบไหน
   *
   * เทียบกับ agreedQty ไม่ใช่ requestedQty: ร้านยืนยัน 10→15 แล้ว พนักงานลดเหลือ 12 ต้องไม่
   * กลับไปรอยืนยันอีก (เดิมเทียบกับ 10 ที่แช่ไว้ จึงรอใหม่ทุกครั้งที่แตะ)
   */
  async updateOrderItemQty(orderId, itemId, finalQty) {
    const existing = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      select: { requestedQty: true, agreedQty: true },
    });
    if (!existing) throw new Error("ORDER_ITEM_NOT_FOUND");

    const baseline = existing.agreedQty ?? existing.requestedQty;
    const pendingConfirm = baseline != null && finalQty > baseline;

    // ต้องมี orderId ใน where ด้วย — ไม่งั้นผ่าน assertOrderAccess ออเดอร์ตัวเอง
    // แล้วส่ง itemId ของออเดอร์ร้านอื่นเข้ามาแก้ได้
    // updateMany เพราะ (id, orderId) ไม่ใช่ unique key ใน Prisma
    const res = await prisma.orderItem.updateMany({
      where: { id: itemId, orderId, order: { status: "pending_approval" } },
      data: {
        finalQty,
        qtyIncreasePendingConfirm: pendingConfirm,
        // ตั้งจำนวนกลับขึ้นมา = ไม่ได้ปฏิเสธรายการนี้แล้ว ไม่งั้นเข้า PO แต่จอยังขึ้น "ปฏิเสธแล้ว"
        ...(finalQty > 0 ? { rejectedAt: null, rejectReason: null } : {}),
      },
    });
    if (res.count === 0) throw new Error("ORDER_ITEM_NOT_FOUND");
    return { pendingConfirm };
  },

  /**
   * ร้านยืนยันจำนวนที่พนักงานเพิ่มให้ — ปลดล็อก + จำว่าร้านตกลงจำนวนนี้แล้ว (agreedQty)
   * ไม่แตะ requestedQty (ยังใช้แยก PO-C/D ตามจำนวนที่ร้านขอตอนแรก)
   */
  async confirmQtyIncrease(orderId, itemId) {
    const existing = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId, qtyIncreasePendingConfirm: true },
      select: { finalQty: true },
    });
    if (!existing) throw new Error("ORDER_ITEM_NOT_FOUND");
    // finalQty อยู่ใน where ด้วย — พนักงานแก้จำนวนระหว่างที่ร้านกด ร้านต้องยืนยันตัวเลขใหม่อีกครั้ง
    const res = await prisma.orderItem.updateMany({
      where: {
        id: itemId,
        orderId,
        qtyIncreasePendingConfirm: true,
        finalQty: existing.finalQty,
        order: { status: "pending_approval" },
      },
      data: { qtyIncreasePendingConfirm: false, agreedQty: existing.finalQty },
    });
    if (res.count === 0) throw new Error("ORDER_ITEM_NOT_FOUND");
  },

  /** ร้านปฏิเสธจำนวนที่เพิ่ม — คืน finalQty กลับไปเท่าจำนวนล่าสุดที่ร้านตกลงไว้ */
  async rejectQtyIncrease(orderId, itemId) {
    const existing = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId, qtyIncreasePendingConfirm: true },
      select: { requestedQty: true, agreedQty: true },
    });
    const back = existing?.agreedQty ?? existing?.requestedQty;
    if (!existing || back == null) {
      throw new Error("ORDER_ITEM_NOT_FOUND");
    }
    const res = await prisma.orderItem.updateMany({
      where: { id: itemId, orderId, qtyIncreasePendingConfirm: true, order: { status: "pending_approval" } },
      data: { finalQty: back, qtyIncreasePendingConfirm: false },
    });
    if (res.count === 0) throw new Error("ORDER_ITEM_NOT_FOUND");
  },

  /**
   * ปฏิเสธรายการเดียวในออเดอร์ (คนละอันกับปฏิเสธทั้งใบ) — ตั้ง finalQty เป็น 0 เหมือน
   * "ตัดบรรทัดออก" เดิม เพื่อให้ approve-with-split.ts กันรายการนี้ออกจาก PO ได้โดยไม่ต้อง
   * แก้เงื่อนไขที่ทดสอบไว้แล้ว แค่แช่เหตุผล/เวลาไว้ให้ดูย้อนหลังเพิ่ม
   */
  async rejectOrderItem(orderId, itemId, reason) {
    const res = await prisma.orderItem.updateMany({
      where: { id: itemId, orderId, order: { status: "pending_approval" } },
      // ล้างธงรอร้านยืนยันด้วย — ไม่งั้นร้านเห็น "ขอเพิ่มเป็น 0 หีบ" และถ้าร้านกดปฏิเสธ
      // จำนวนจะกลับไปเท่าที่ร้านขอ ทำให้รายการที่พนักงานปฏิเสธแล้วกลับเข้า PO
      data: {
        finalQty: 0,
        rejectedAt: new Date(),
        rejectReason: reason ?? null,
        qtyIncreasePendingConfirm: false,
      },
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
