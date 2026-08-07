import {
  calcLineAmount,
  calcMaxStock,
  calcMinStock,
  calcNetUnitPrice,
  calcStockCvd,
  calcSuggestOrder,
  getPromoForQty,
  piecesToCases,
  type PromoResult,
  type PromoTierInput,
} from "@/lib/calculations";
import { activePromoRowAtQty } from "@/lib/fabric/promotion-lookup";
import type { PromoRow } from "@/lib/fabric/promotion-credit";
import { bangkokDateStr, isoDateStr, daysBetweenIso } from "@/lib/fabric/bkk-date";
import type { StockRowComputed } from "./types";

export function mapStockRow(
  storeId: string,
  item: {
    skuId: string;
    /** คงเหลือหน่วยชิ้น (qty_available ดิบ) */
    stock: number;
    /** ยอดขายเฉลี่ยหน่วยชิ้น/วัน */
    avgSales: number;
    avgQtyOutL7?: number;
    /** ชิ้นต่อหีบ — ไม่ระบุ = 1 (ถือว่าข้อมูลเป็นหีบอยู่แล้ว) */
    packSize?: number;
    noSales30?: boolean;
    minDays: number;
    maxDays: number;
    thresholdSource?: "sku" | "section" | "default";
    fromDb?: string;
    unitPrice?: number | null;
    /** มูลค่าสต็อกจริงจาก product.product (รวมมาแล้ว — ห้ามคูณ stock ซ้ำ) */
    stockValue?: number | null;
    priceExpired?: boolean;
    c4PromoRows?: PromoRow[];
    promoGroup?: string | null;
    promoGroupMembers?: number;
    barcode?: string;
    section?: string;
    brand?: string;
    sku: {
      code: string;
      name: string;
      promoTiers: PromoTierInput[];
    };
    promoOverride?: PromoResult;
    poolQtyForDiscount?: number;
    isNew?: boolean;
    blocked?: boolean;
    blockReason?: string | null;
    blockEffectiveFrom?: string | null;
    blockEffectiveTo?: string | null;
  }
): StockRowComputed {
  // แปลง ชิ้น → หีบ ที่นี่จุดเดียว แล้วปลายน้ำเป็นหีบล้วน
  // (ราคา CreditPrice และ promo tier C4 นับเป็นหีบ ส่วน stock_cover_day นับเป็นชิ้น)
  const packSize = item.packSize && item.packSize > 0 ? item.packSize : 1;
  const stockPieces = item.stock;
  const { cases: stockCases, remainder: stockRemainder } = piecesToCases(
    stockPieces,
    packSize
  );
  const stock = stockPieces / packSize;
  const avgSales = item.avgSales / packSize;
  const avgQtyOutL7 = (item.avgQtyOutL7 ?? item.avgSales) / packSize;

  const minStock = calcMinStock(avgSales, item.minDays);
  const maxStock = calcMaxStock(avgSales, item.maxDays);
  // ถ้าอยู่ใน blocklist (ถึงกำหนดแล้ว) ไม่ต้องแนะนำสั่ง
  // calcSuggestOrder ปัด Math.ceil อยู่แล้ว — พอเป็นหน่วยหีบจึงได้ "ปัดขึ้นเป็นหีบเต็ม"
  const suggestOrder = item.blocked
    ? 0
    : calcSuggestOrder(stock, avgSales, item.minDays, item.maxDays);

  let discountBaht: number | null = null;
  let discountPct: number | null = null;
  const tierQty =
    item.poolQtyForDiscount ??
    (suggestOrder > 0 ? suggestOrder : 0);

  if (item.c4PromoRows?.length && suggestOrder > 0 && tierQty > 0) {
    const active = activePromoRowAtQty(item.c4PromoRows, tierQty);
    if (active) {
      discountBaht = active.discAmt > 0 ? active.discAmt : null;
      discountPct =
        !discountBaht && active.discPct > 0 ? active.discPct : null;
    }
  }

  const netUnitPrice = calcNetUnitPrice(
    item.unitPrice,
    discountBaht,
    discountPct
  );
  const lineTotal =
    suggestOrder > 0
      ? calcLineAmount(suggestOrder, item.unitPrice, netUnitPrice)
      : null;

  const promo =
    item.promoOverride ??
    getPromoForQty(
      tierQty > 0 ? tierQty : 1,
      item.sku.promoTiers
    );

  const showPromo = suggestOrder > 0;

  // จำนวนวันที่โปร active จะหมด (นับวันที่ใกล้สุดในบรรดา c4PromoRows ที่ active อยู่)
  let currentPromoEndsInDays: number | null = null;
  if (item.c4PromoRows?.length) {
    const today = bangkokDateStr(new Date());
    for (const r of item.c4PromoRows) {
      if (!r.toDate) continue;
      const d = daysBetweenIso(today, isoDateStr(r.toDate));
      if (d >= 0 && (currentPromoEndsInDays === null || d < currentPromoEndsInDays)) {
        currentPromoEndsInDays = d;
      }
    }
  }

  return {
    storeId,
    skuId: item.skuId,
    skuCode: item.sku.code,
    skuName: item.sku.name,
    barcode: item.barcode ?? "",
    section: item.section ?? "",
    brand: item.brand ?? "",
    packSize,
    stockPieces,
    stockCases,
    stockRemainder,
    stock,
    avgSales,
    avgQtyOutL7,
    noSales30: item.noSales30 ?? false,
    minDays: item.minDays,
    maxDays: item.maxDays,
    thresholdSource: item.thresholdSource ?? "default",
    minStock,
    maxStock,
    stockCvd: calcStockCvd(stock, avgSales),
    suggestOrder,
    currentPromo: showPromo ? promo.currentPromo : null,
    nextPromo: showPromo ? promo.nextPromo : null,
    nextPromoQty: showPromo ? promo.nextPromoQty : null,
    qtyToNext: showPromo ? promo.qtyToNext : null,
    currentPromoKind: showPromo ? promo.currentKind : null,
    nextPromoKind: showPromo ? promo.nextKind : null,
    hasPromoLadder: showPromo ? promo.hasPromoLadder : false,
    currentPromoEndsInDays,
    promoGroup: item.promoGroup ?? null,
    promoGroupMembers: item.promoGroupMembers ?? 0,
    promoTiers: item.sku.promoTiers,
    unitPrice: item.unitPrice ?? null,
    stockValue: item.stockValue ?? null,
    discountBahtPerCase: showPromo ? discountBaht : null,
    discountPctPerCase: showPromo ? discountPct : null,
    netUnitPrice: showPromo ? netUnitPrice : item.unitPrice ?? null,
    lineTotal: showPromo ? lineTotal : null,
    priceExpired: item.priceExpired ?? false,
    needsOrder: suggestOrder > 0,
    fromDb: item.fromDb,
    isNew: item.isNew ?? false,
    blocked: item.blocked ?? false,
    blockReason: item.blockReason ?? null,
    blockEffectiveFrom: item.blockEffectiveFrom ?? null,
    blockEffectiveTo: item.blockEffectiveTo ?? null,
    freeGood: null,
  };
}
