import {
  calcLineAmount,
  calcNetUnitPrice,
  getPromoForQty,
  isBenefitTier,
  type PromoTierInput,
} from "@/lib/calculations";
import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import type { StockRowComputed } from "@/lib/repositories/types";

export type StagedQtyMap = Record<string, number>;

function activeBenefitTier(
  tiers: PromoTierInput[],
  qty: number
): PromoTierInput | null {
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  let current: PromoTierInput | null = null;
  for (const tier of sorted) {
    if (qty >= tier.minQty && isBenefitTier(tier)) current = tier;
  }
  return current;
}

function lineQtyForRow(row: StockRowComputed, staged?: StagedQtyMap): number {
  const override = staged?.[row.skuCode];
  if (override != null && override > 0) return override;
  return row.suggestOrder > 0 ? row.suggestOrder : 0;
}

function shouldShowPromo(row: StockRowComputed, staged?: StagedQtyMap): boolean {
  return lineQtyForRow(row, staged) > 0;
}

function clearPromoFields(row: StockRowComputed): StockRowComputed {
  return {
    ...row,
    currentPromo: null,
    nextPromo: null,
    nextPromoQty: null,
    qtyToNext: null,
    currentPromoKind: null,
    nextPromoKind: null,
    hasPromoLadder: false,
    discountBahtPerCase: null,
    discountPctPerCase: null,
    netUnitPrice: row.unitPrice ?? null,
    lineTotal: null,
  };
}

function applyTierPricing(
  row: StockRowComputed,
  tierQty: number,
  lineQty: number
): StockRowComputed {
  const promo = getPromoForQty(tierQty, row.promoTiers);
  const active = activeBenefitTier(row.promoTiers, tierQty);
  const discountBaht =
    active?.discBaht != null && active.discBaht > 0 ? active.discBaht : null;
  const discountPct =
    !discountBaht && active?.discPct != null && active.discPct > 0
      ? active.discPct
      : null;
  const netUnitPrice = calcNetUnitPrice(
    row.unitPrice,
    discountBaht,
    discountPct
  );
  const lineTotal =
    lineQty > 0
      ? calcLineAmount(lineQty, row.unitPrice, netUnitPrice)
      : null;

  return {
    ...row,
    currentPromo: promo.currentPromo,
    nextPromo: promo.nextPromo,
    nextPromoQty: promo.nextPromoQty,
    qtyToNext: promo.qtyToNext,
    currentPromoKind: promo.currentKind,
    nextPromoKind: promo.nextKind,
    hasPromoLadder: promo.hasPromoLadder,
    discountBahtPerCase: discountBaht,
    discountPctPerCase: discountPct,
    netUnitPrice,
    lineTotal,
  };
}

/** รวมยอดโปรกลุ่ม (ASSORTEDPRODUCTGROUP) แล้วคำนวณส่วนลด/ข้อความโปรใหม่ */
export function enrichStockRowsWithPooledPromo(
  rows: StockRowComputed[],
  staged?: StagedQtyMap
): StockRowComputed[] {
  const groupPool = new Map<string, number>();
  for (const row of rows) {
    if (!isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) continue;
    const qty = lineQtyForRow(row, staged);
    if (qty <= 0) continue;
    const key = row.promoGroup!.trim();
    groupPool.set(key, (groupPool.get(key) ?? 0) + qty);
  }

  return rows.map((row) => {
    if (!shouldShowPromo(row, staged)) {
      return clearPromoFields(row);
    }

    const lineQty = lineQtyForRow(row, staged);
    const pooled =
      row.promoGroup &&
      isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)
        ? groupPool.get(row.promoGroup.trim()) ?? lineQty
        : lineQty;
    const tierQty = pooled > 0 ? pooled : lineQty;

    return applyTierPricing(row, tierQty, lineQty);
  });
}

/** รวม suggestOrder ต่อกลุ่มสำหรับ build ฝั่ง server */
export function sumGroupSuggestQty(
  items: { promoGroup?: string | null; promoGroupMembers?: number; suggestOrder: number }[]
): Map<string, number> {
  const pools = new Map<string, number>();
  for (const item of items) {
    if (!isPooledPromoGroup(item.promoGroup, item.promoGroupMembers)) continue;
    if (item.suggestOrder <= 0) continue;
    const key = item.promoGroup!.trim();
    pools.set(key, (pools.get(key) ?? 0) + item.suggestOrder);
  }
  return pools;
}
