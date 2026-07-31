import { prisma } from "@/lib/prisma";
import { calcNetUnitPrice, resolveOrderLinePrice } from "@/lib/calculations";
import { resolveVdaStoreName } from "@/lib/fabric/vda-store-name";
import { buildPoDocument, type PoDocument } from "./po-document";
import type { PoPriceKind } from "./split-plan";

/**
 * ประกอบเอกสาร PO ขึ้นใหม่จากฐานข้อมูล
 *
 * ไฟล์ JSON ที่เขียนตอนอนุมัติ (writePoDocument) เป็นแหล่งอ้างอิงหลัก
 * แต่ถ้าไฟล์ถูกย้าย/ลบ หรือ volume หาย เดิมจะดู PO ไม่ได้เลย (410)
 * ทั้งที่ข้อมูลทุกอย่างยังอยู่ใน PurchaseOrder + OrderItem
 *
 * หมายเหตุ: ราคาที่ได้คำนวณจาก OrderItem ปัจจุบัน — ตรงกับไฟล์เสมอ
 * เพราะออเดอร์ที่อนุมัติแล้วแก้ไม่ได้ (PATCH กั้นที่สถานะ pending_approval)
 */
export async function rebuildPoDocumentFromDb(
  poNumber: string
): Promise<PoDocument | null> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { poNumber },
    include: {
      order: { include: { store: true } },
      items: { include: { sku: true } },
    },
  });
  if (!po) return null;

  const storeCode = po.order.store.code;
  return buildPoDocument({
    poNumber: po.poNumber,
    groupKey: po.groupKey,
    priceKind: po.priceKind as PoPriceKind,
    orderId: po.orderId,
    storeCode,
    storeName: resolveVdaStoreName(storeCode) || po.order.store.name,
    approvedAt: po.issuedAt,
    approvedBy: po.issuedBy,
    lines: po.items.map((item) => {
      const { unitPrice, source } = resolveOrderLinePrice({
        salesPriceOverride: item.salesPriceOverride,
        unitPriceOverride: item.unitPriceOverride,
        c4UnitPrice: item.c4UnitPrice,
      });
      return {
        skuCode: item.sku.code,
        skuName: item.sku.name,
        qty: item.finalQty,
        unit: "case" as const,
        unitPrice,
        priceSource: source,
        discountBaht: item.c4DiscountBaht,
        discountPct: item.c4DiscountPct,
        netUnitPrice:
          calcNetUnitPrice(unitPrice, item.c4DiscountBaht, item.c4DiscountPct) ??
          unitPrice,
        promoGroup: item.c4PromoGroup,
        promoGroupMembers: item.c4PromoGroupMembers,
        promoLabel: item.c4PromoLabel,
        freeGood: item.c4FreeGoodCode
          ? {
              code: item.c4FreeGoodCode,
              name: item.c4FreeGoodName || item.c4FreeGoodCode,
              qty: item.c4FreeGoodQty ?? 0,
              unit: item.c4FreeGoodUnit ?? "",
            }
          : null,
        priceFlagged: item.priceFlagged,
        priceFlagReason: item.priceFlagReason,
      };
    }),
  });
}
