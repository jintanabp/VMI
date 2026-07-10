import {
  calcLineAmount,
  calcMaxStock,
  calcMinStock,
  calcNetUnitPrice,
  calcStockCvd,
  calcSuggestOrder,
  getPromoForQty,
  type PromoResult,
  type PromoTierInput,
} from "@/lib/calculations";
import { activePromoRowAtQty } from "@/lib/fabric/promotion-lookup";
import type { PromoRow } from "@/lib/fabric/promotion-credit";
import type { StockRowComputed } from "./types";

export function mapStockRow(
  storeId: string,
  item: {
    skuId: string;
    stock: number;
    avgSales: number;
    avgQtyOutL7?: number;
    minDays: number;
    maxDays: number;
    fromDb?: string;
    unitPrice?: number | null;
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
  }
): StockRowComputed {
  const minStock = calcMinStock(item.avgSales, item.minDays);
  const maxStock = calcMaxStock(item.avgSales, item.maxDays);
  // ถ้าอยู่ใน blocklist (ถึงกำหนดแล้ว) ไม่ต้องแนะนำสั่ง
  const suggestOrder = item.blocked
    ? 0
    : calcSuggestOrder(item.stock, item.avgSales, item.minDays, item.maxDays);

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

  return {
    storeId,
    skuId: item.skuId,
    skuCode: item.sku.code,
    skuName: item.sku.name,
    barcode: item.barcode ?? "",
    section: item.section ?? "",
    brand: item.brand ?? "",
    stock: item.stock,
    avgSales: item.avgSales,
    avgQtyOutL7: item.avgQtyOutL7 ?? item.avgSales,
    minDays: item.minDays,
    maxDays: item.maxDays,
    minStock,
    maxStock,
    stockCvd: calcStockCvd(item.stock, item.avgSales),
    suggestOrder,
    currentPromo: showPromo ? promo.currentPromo : null,
    nextPromo: showPromo ? promo.nextPromo : null,
    nextPromoQty: showPromo ? promo.nextPromoQty : null,
    qtyToNext: showPromo ? promo.qtyToNext : null,
    currentPromoKind: showPromo ? promo.currentKind : null,
    nextPromoKind: showPromo ? promo.nextKind : null,
    hasPromoLadder: showPromo ? promo.hasPromoLadder : false,
    promoGroup: item.promoGroup ?? null,
    promoGroupMembers: item.promoGroupMembers ?? 0,
    promoTiers: item.sku.promoTiers,
    unitPrice: item.unitPrice ?? null,
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
  };
}
