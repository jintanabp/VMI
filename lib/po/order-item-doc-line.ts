import { calcNetUnitPrice, resolveOrderLinePrice } from "@/lib/calculations";
import type { PoDocumentLine } from "./po-document";
import { skuVatStatus } from "./sku-vat-status";

/**
 * แปลง OrderItem หนึ่งแถวเป็นบรรทัดเอกสาร PO — จุดเดียวที่ทำสิ่งนี้
 *
 * เดิมโค้ดนี้ซ้ำอยู่ 2 ที่ (approve-with-split.ts ตอนออก PO ครั้งแรก และ po-from-db.ts
 * ตอนประกอบเอกสารใหม่จาก DB) พอมี clone-for-erp.ts เป็นที่ที่ 3 ที่ต้องทำเรื่องเดียวกัน
 * (คัดลอกบรรทัดของใบเดิมไปใบที่ขอเลขใหม่) จึงรวมเป็นฟังก์ชันเดียวกันเพื่อไม่ให้พลาดจุดใดจุดหนึ่ง
 * แบบเดียวกับที่บั๊ก VAT เคยเกิดตอนมีสูตรซ้ำกันหลายที่
 */
export interface OrderItemForDocLine {
  sku: { code: string; name: string };
  finalQty: number;
  unitPriceOverride: number | null;
  c4UnitPrice: number | null;
  c4DiscountBaht: number | null;
  c4DiscountPct: number | null;
  salesPriceOverride: number | null;
  c4PromoGroup: string | null;
  c4PromoGroupMembers: number | null;
  c4PromoLabel: string | null;
  c4FreeGoodCode: string | null;
  c4FreeGoodName: string | null;
  c4FreeGoodQty: number | null;
  c4FreeGoodUnit: string | null;
  priceFlagged: boolean;
  priceFlagReason: string | null;
}

export function orderItemToDocLine(
  item: OrderItemForDocLine
): Omit<PoDocumentLine, "amount" | "vatAmount"> {
  const { unitPrice, source } = resolveOrderLinePrice({
    salesPriceOverride: item.salesPriceOverride,
    unitPriceOverride: item.unitPriceOverride,
    c4UnitPrice: item.c4UnitPrice,
  });
  return {
    skuCode: item.sku.code,
    skuName: item.sku.name,
    qty: item.finalQty,
    unit: "case",
    unitPrice,
    priceSource: source,
    vatStatus: skuVatStatus(item.sku.code),
    discountBaht: item.c4DiscountBaht,
    discountPct: item.c4DiscountPct,
    // ส่วนลด C4 คิดทับบนราคาที่มีผล (ตั้งเอง/ร้านขอ/C4) — ห้ามคิดจาก c4UnitPrice ตรง ๆ
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
}
