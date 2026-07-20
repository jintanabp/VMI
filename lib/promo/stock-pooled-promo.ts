import {
  calcLineAmount,
  calcNetUnitPrice,
  calcStepPremiumQty,
  formatPremiumUnit,
  getPromoForQty,
  isBenefitTier,
  type PromoTierInput,
} from "@/lib/calculations";
import { isPooledPromoGroup } from "@/lib/promo/promo-group-display";
import type { StockFreeGood, StockRowComputed } from "@/lib/repositories/types";

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

function buildFreeGood(
  tier: PromoTierInput | null,
  tierQty: number
): StockFreeGood | null {
  if (!tier || tier.kind !== "premium" || !tier.premiumProduct) return null;
  const tierPremiumQty = tier.premiumQty ?? 0;
  const qty = calcStepPremiumQty(tierQty, tier.minQty, tierPremiumQty);
  if (qty <= 0) return null;
  return {
    premiumProduct: tier.premiumProduct,
    premiumName: tier.premiumName || tier.premiumProduct,
    qty,
    unitLabel: formatPremiumUnit(tier.premiumUnit ?? ""),
    tierFromQty: tier.minQty,
    tierPremiumQty,
  };
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
    freeGood: null,
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
    freeGood: buildFreeGood(active, tierQty),
  };
}

function enrichOne(
  row: StockRowComputed,
  staged: StagedQtyMap | undefined,
  groupPool: Map<string, number>
): StockRowComputed {
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
}

function buildGroupPool(
  rows: StockRowComputed[],
  staged?: StagedQtyMap
): Map<string, number> {
  const groupPool = new Map<string, number>();
  for (const row of rows) {
    if (!isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) continue;
    const qty = lineQtyForRow(row, staged);
    if (qty <= 0) continue;
    const key = row.promoGroup!.trim();
    groupPool.set(key, (groupPool.get(key) ?? 0) + qty);
  }
  return groupPool;
}

/** รวมยอดโปรกลุ่ม แล้วคำนวณส่วนลด/ข้อความโปร
 *  ถ้าระบุ previous + changedSkuCodes จะคำนวณใหม่เฉพาะกลุ่มที่กระทบ (reuse อ้างอิงแถวอื่น) */
export function enrichStockRowsWithPooledPromo(
  rows: StockRowComputed[],
  staged?: StagedQtyMap,
  options?: {
    previous?: StockRowComputed[];
    changedSkuCodes?: ReadonlySet<string>;
  }
): StockRowComputed[] {
  const groupPool = buildGroupPool(rows, staged);
  const previous = options?.previous;
  const changed = options?.changedSkuCodes;

  if (!previous?.length || !changed?.size || previous.length !== rows.length) {
    return rows.map((row) => enrichOne(row, staged, groupPool));
  }

  const prevByCode = new Map(previous.map((r) => [r.skuCode, r]));
  const dirtyGroups = new Set<string>();
  for (const code of changed) {
    const row =
      rows.find((r) => r.skuCode === code) ?? prevByCode.get(code);
    if (row?.promoGroup && isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) {
      dirtyGroups.add(row.promoGroup.trim());
    }
  }

  return rows.map((row, i) => {
    const groupKey =
      row.promoGroup &&
      isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)
        ? row.promoGroup.trim()
        : null;
    const mustRecompute =
      changed.has(row.skuCode) ||
      (groupKey != null && dirtyGroups.has(groupKey));

    if (!mustRecompute) {
      const prev = previous[i];
      if (prev && prev.skuId === row.skuId && prev.skuCode === row.skuCode) {
        // ฐานข้อมูลแถวอาจเปลี่ยน (เช่น stock sync) — ถ้าระบุ fields หลักเดิมค่อย reuse promo
        if (
          prev.stock === row.stock &&
          prev.avgSales === row.avgSales &&
          prev.suggestOrder === row.suggestOrder &&
          prev.unitPrice === row.unitPrice
        ) {
          return prev;
        }
      }
    }
    return enrichOne(row, staged, groupPool);
  });
}

/** รวม suggestOrder ต่อกลุ่มสำหรับ build ฝั่ง server */
export function sumGroupSuggestQty(
  items: {
    promoGroup?: string | null;
    promoGroupMembers?: number;
    suggestOrder: number;
  }[]
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

/**
 * แถวที่ควรแสดงแถวย่อยของแถม:
 * - โปรราย SKU → แสดงใต้แถวนั้น
 * - โปรกลุ่ม → แสดงครั้งเดียวใต้สมาชิกแรกในรายการที่ยังได้ของแถม
 */
export function isFreeGoodHostRow(
  rows: {
    freeGood?: StockFreeGood | null;
    promoGroup?: string | null;
    promoGroupMembers?: number;
  }[],
  index: number
): boolean {
  const row = rows[index];
  if (!row?.freeGood || row.freeGood.qty <= 0) return false;
  if (!isPooledPromoGroup(row.promoGroup, row.promoGroupMembers)) return true;
  const g = row.promoGroup!.trim();
  for (let i = 0; i < index; i++) {
    const prev = rows[i];
    if (
      prev.promoGroup?.trim() === g &&
      prev.freeGood != null &&
      prev.freeGood.qty > 0
    ) {
      return false;
    }
  }
  return true;
}
