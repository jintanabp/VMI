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

export function normalizeProductCode(code: string): string {
  return code.trim().replace(/^0+/, "") || "0";
}

/** อ่าน qty จาก map ที่ key เป็น skuCode โดยจับคู่รหัส C4 แบบยืดหยุ่น */
export function lookupStagedQty(
  stagedQty: Record<string, number>,
  productCode: string
): number {
  if (productCode in stagedQty) return stagedQty[productCode]!;
  const norm = normalizeProductCode(productCode);
  for (const [key, val] of Object.entries(stagedQty)) {
    if (normalizeProductCode(key) === norm) return val;
  }
  return 0;
}

export function seedModalStaged(
  products: Array<{ product: string }>,
  stagedQty: Record<string, number>
): Record<string, number> {
  const seed: Record<string, number> = {};
  for (const p of products) {
    seed[p.product] = lookupStagedQty(stagedQty, p.product);
  }
  return seed;
}

type SkuLookupRow = { skuCode: string; barcode?: string | null };

function buildSkuCodeIndex(rows: SkuLookupRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const r of rows) {
    const add = (key: string) => {
      const k = key.trim();
      if (!k) return;
      index.set(k, r.skuCode);
      index.set(normalizeProductCode(k), r.skuCode);
    };
    add(r.skuCode);
    if (r.barcode) add(r.barcode);
  }
  return index;
}

function resolveStagedSku(
  index: Map<string, string>,
  code: string
): string | null {
  const k = code.trim();
  return index.get(k) ?? index.get(normalizeProductCode(k)) ?? null;
}

/** แมปรหัสจาก C4 modal → skuCode ในสต็อก (รองรับ leading zero ไม่ตรงกัน) */
export function mapStagedQtyToSkuCodes(
  rows: SkuLookupRow[],
  staged: Record<string, number>
): Record<string, number> {
  const index = buildSkuCodeIndex(rows);
  const out: Record<string, number> = {};
  for (const [code, qty] of Object.entries(staged)) {
    const sku = resolveStagedSku(index, code);
    if (!sku) continue;
    out[sku] = Math.max(0, Math.floor(qty));
  }
  return out;
}

/** แมปจำนวนจาก modal โปรกลุ่ม → เฉพาะ SKU สมาชิกที่อยู่ในหน้าสต็อก */
export function mapGroupStagedToMemberSkus(
  rows: SkuLookupRow[],
  memberSkus: string[],
  staged: Record<string, number>
): Record<string, number> {
  const members = new Set(memberSkus);
  const memberRows = rows.filter((r) => members.has(r.skuCode));
  const index = buildSkuCodeIndex(memberRows);
  const out: Record<string, number> = {};
  for (const [code, qty] of Object.entries(staged)) {
    const sku = resolveStagedSku(index, code);
    if (sku && members.has(sku)) {
      out[sku] = Math.max(0, Math.floor(qty));
    }
  }
  return out;
}

/** map รหัส C4 / skuCode / barcode → จำนวนแนะนำ สำหรับ modal โปรกลุ่ม */
export function buildSuggestByProduct(
  rows: Array<{ skuCode: string; suggestOrder: number; barcode?: string | null }>
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    if (r.suggestOrder <= 0) continue;
    const add = (key: string) => {
      const k = key.trim();
      if (!k) return;
      m[k] = r.suggestOrder;
      m[normalizeProductCode(k)] = r.suggestOrder;
    };
    add(r.skuCode);
    if (r.barcode) add(r.barcode);
  }
  return m;
}

/** จับคู่รหัส C4 กับ skuCode สมาชิกในร้าน (leading zero / barcode) */
export function productMatchesMemberSkus(
  product: string,
  memberSkus: string[]
): boolean {
  const norm = normalizeProductCode(product);
  return memberSkus.some(
    (sku) => sku === product || normalizeProductCode(sku) === norm
  );
}

/** กรองรายการใน modal ให้ตรงกับ SKU ที่ร้านมีในสต็อก */
export function filterProductsToStockMembers<
  T extends { product: string },
>(products: T[], memberSkus?: string[]): T[] {
  if (!memberSkus?.length) return products;
  return products.filter((p) => productMatchesMemberSkus(p.product, memberSkus));
}

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
  if (override != null) return Math.max(0, Math.floor(override));
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
