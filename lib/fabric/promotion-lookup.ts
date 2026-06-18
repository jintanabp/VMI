import type { PromoTierInput, PromoTierKind } from "@/lib/calculations";
import {
  getPromoForQty,
  type PromoResult,
} from "@/lib/calculations";
import {
  hasPremium,
  isStepTier,
  promoActiveOn,
  promoServesRegion,
  type PromoRow,
  type PromotionCredit,
} from "./promotion-credit";

export function normalizeRegion(area: string): string {
  return (area || "").toUpperCase().replace(/\s+/g, "");
}

export interface C4Line {
  itemId: string;
  product: string;
  qty: number;
}

export interface C4LineResult {
  itemId: string;
  product: string;
  poolKey: string;
  pooledQty: number;
  discountBaht: number | null;
  discountPct: number | null;
  freeGood: C4LineFreeGood | null;
  reason: string;
}

export interface C4LineFreeGood {
  premiumProduct: string;
  qty: number;
  unit: string;
  tierFromQty: number;
  tierPremiumQty: number;
  pooledQty: number;
}

export interface C4FreeGood {
  poolKey: string;
  premiumProduct: string;
  qty: number;
  unit: string;
  reason: string;
}

export interface C4LookupResult {
  lines: C4LineResult[];
  freeGoods: C4FreeGood[];
  skipped: { itemId: string; product: string; reason: string }[];
}

export function activePromoRowAtQty(
  rows: PromoRow[],
  qty: number
): PromoRow | null {
  const sorted = [...rows].sort((a, b) => a.fromQty - b.fromQty);
  let active: PromoRow | null = null;
  for (const r of sorted) {
    if (qty >= r.fromQty) active = r;
    else break;
  }
  return active;
}

function activeTier(rows: PromoRow[], pooledQty: number): PromoRow | null {
  return activePromoRowAtQty(rows, pooledQty);
}

/** ของแถมขั้นบันได: floor(pooled / FROM) × PREMIUMQTY ตาม tier ที่ active */
export function calcStepPremiumQty(
  pooledQty: number,
  tierFromQty: number,
  tierPremiumQty: number
): number {
  if (tierFromQty <= 0 || tierPremiumQty <= 0 || pooledQty <= 0) return 0;
  return Math.floor(pooledQty / tierFromQty) * tierPremiumQty;
}

export function formatPremiumUnit(unit: string): string {
  const u = (unit || "").toUpperCase().trim();
  if (u === "P") return "ชิ้น";
  if (u === "B") return "ลัง";
  return unit.trim() || "หน่วย";
}

export function lookupC4(
  lines: C4Line[],
  opts: {
    division: string;
    cusgroup: string;
    region: string;
    day?: Date;
    promo: PromotionCredit;
  }
): C4LookupResult {
  const day = opts.day ?? new Date();
  const region = normalizeRegion(opts.region);
  const result: C4LookupResult = { lines: [], freeGoods: [], skipped: [] };

  const pools = new Map<
    string,
    { lines: C4Line[]; rows: PromoRow[] }
  >();

  for (const ln of lines) {
    const cands = opts.promo
      .rowsFor(opts.division, opts.cusgroup, ln.product)
      .filter((r) => promoActiveOn(r, day) && promoServesRegion(r, region));

    if (cands.length === 0) {
      result.skipped.push({
        itemId: ln.itemId,
        product: ln.product,
        reason: "no matching C4 promotion",
      });
      continue;
    }

    const poolKey = cands[0].poolKey;
    const pool = pools.get(poolKey) ?? { lines: [], rows: [] };
    pool.lines.push(ln);
    pool.rows.push(...cands);
    pools.set(poolKey, pool);
  }

  for (const [poolKey, pool] of pools) {
    const pooledQty = pool.lines.reduce((s, l) => s + (l.qty || 0), 0);
    const sortedRows = [...pool.rows].sort(
      (a, b) => a.fromQty - b.fromQty || a.toQty - b.toQty
    );
    const active = activeTier(sortedRows, pooledQty);

    if (!active) {
      for (const l of pool.lines) {
        result.skipped.push({
          itemId: l.itemId,
          product: l.product,
          reason: "quantity below smallest tier",
        });
      }
      continue;
    }

    if (!isStepTier(active) && pooledQty > active.toQty) {
      for (const l of pool.lines) {
        result.skipped.push({
          itemId: l.itemId,
          product: l.product,
          reason: `qty ${pooledQty} above top tier`,
        });
      }
      continue;
    }

    const discBaht = active.discAmt > 0 ? active.discAmt : null;
    const discPct =
      !discBaht && active.discPct > 0 ? active.discPct : null;
    const reason = `tier ${active.fromQty}-${active.toQty} @ pooled ${pooledQty}`;

    for (const l of pool.lines) {
      result.lines.push({
        itemId: l.itemId,
        product: l.product,
        poolKey,
        pooledQty,
        discountBaht: discBaht,
        discountPct: discPct,
        freeGood: null,
        reason,
      });
    }

    if (isStepTier(active) && hasPremium(active)) {
      const freeQty = calcStepPremiumQty(
        pooledQty,
        active.fromQty,
        active.premiumQty
      );
      if (freeQty > 0) {
        const firstItemId = pool.lines[0]?.itemId;
        result.freeGoods.push({
          poolKey,
          premiumProduct: active.premiumProduct,
          qty: freeQty,
          unit: active.premiumUnit,
          reason: `buy ${pooledQty} → ${freeQty} free ${active.premiumProduct} (tier ${active.fromQty}, ×${active.premiumQty})`,
        });
        const host = result.lines.find(
          (ln) => ln.poolKey === poolKey && ln.itemId === firstItemId
        );
        if (host) {
          host.freeGood = {
            premiumProduct: active.premiumProduct,
            qty: freeQty,
            unit: active.premiumUnit,
            tierFromQty: active.fromQty,
            tierPremiumQty: active.premiumQty,
            pooledQty,
          };
        }
      }
    }
  }

  return result;
}

export function formatPromoDiscount(row: PromoRow): string {
  if (row.discAmt > 0) return `${row.discAmt} บาท/หีบ`;
  if (row.discPct > 0) return `${row.discPct}%`;
  if (hasPremium(row)) {
    return `แถม ${row.premiumProduct} ×${row.premiumQty}`;
  }
  return "โปรโมชัน";
}

export function filterCandidateRows(
  promo: PromotionCredit,
  division: string,
  cusgroup: string,
  product: string,
  region: string,
  day: Date = new Date()
): PromoRow[] {
  const normRegion = normalizeRegion(region);
  return promo
    .rowsFor(division, cusgroup, product)
    .filter(
      (r) => promoActiveOn(r, day) && promoServesRegion(r, normRegion)
    );
}

export function tierKind(row: PromoRow): PromoTierKind {
  if (isStepTier(row) && hasPremium(row)) return "premium";
  if (row.discAmt > 0) return "discount_baht";
  if (row.discPct > 0) return "discount_pct";
  return "other";
}

export function promoRowsToTiers(rows: PromoRow[]): PromoTierInput[] {
  const seen = new Set<number>();
  const tiers: PromoTierInput[] = [];
  for (const r of rows) {
    if (seen.has(r.fromQty)) continue;
    seen.add(r.fromQty);
    const kind = tierKind(r);
    tiers.push({
      minQty: r.fromQty,
      discount: formatPromoDiscount(r),
      sortOrder: r.fromQty,
      kind,
      premiumProduct:
        kind === "premium" ? r.premiumProduct : undefined,
      premiumQty: kind === "premium" ? r.premiumQty : undefined,
    });
  }
  return tiers.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getC4PromoForQty(
  qty: number,
  tiers: PromoTierInput[]
): PromoResult {
  return getPromoForQty(qty, tiers);
}
