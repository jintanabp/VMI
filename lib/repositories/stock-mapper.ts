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
    minDays: number;
    maxDays: number;
    fromDb?: string;
    unitPrice?: number | null;
    priceExpired?: boolean;
    c4PromoRows?: PromoRow[];
    sku: {
      code: string;
      name: string;
      promoTiers: PromoTierInput[];
    };
    promoOverride?: PromoResult;
  }
): StockRowComputed {
  const minStock = calcMinStock(item.avgSales, item.minDays);
  const maxStock = calcMaxStock(item.avgSales, item.maxDays);
  const suggestOrder = calcSuggestOrder(
    item.stock,
    item.avgSales,
    item.minDays,
    item.maxDays
  );

  let discountBaht: number | null = null;
  let discountPct: number | null = null;
  if (item.c4PromoRows?.length && suggestOrder > 0) {
    const active = activePromoRowAtQty(item.c4PromoRows, suggestOrder);
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
    getPromoForQty(suggestOrder > 0 ? suggestOrder : 1, item.sku.promoTiers);

  return {
    storeId,
    skuId: item.skuId,
    skuCode: item.sku.code,
    skuName: item.sku.name,
    stock: item.stock,
    avgSales: item.avgSales,
    minDays: item.minDays,
    maxDays: item.maxDays,
    minStock,
    maxStock,
    stockCvd: calcStockCvd(item.stock, item.avgSales),
    suggestOrder,
    currentPromo: suggestOrder > 0 ? promo.currentPromo : null,
    nextPromo: promo.nextPromo,
    nextPromoQty: promo.nextPromoQty,
    qtyToNext: promo.qtyToNext,
    currentPromoKind: promo.currentKind,
    nextPromoKind: promo.nextKind,
    promoTiers: item.sku.promoTiers,
    unitPrice: item.unitPrice ?? null,
    netUnitPrice,
    lineTotal,
    priceExpired: item.priceExpired ?? false,
    needsOrder: suggestOrder > 0,
    fromDb: item.fromDb,
  };
}
