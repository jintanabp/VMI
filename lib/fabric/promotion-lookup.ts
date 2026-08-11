import type { PromoTierInput, PromoTierKind } from "@/lib/calculations";
import {
  calcStepPremiumQty,
  formatPremiumUnit,
  getPromoForQty,
  type PromoResult,
} from "@/lib/calculations";
import {
  hasPremium,
  isStepTier,
  promoActiveOn,
  promoServesRegion,
  tierMinQty,
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

/** ชิ้นต่อหีบของสินค้าของแถม — ไม่ส่งมา = ไม่แปลงหน่วย */
export type PackSizeResolver = (productCode: string) => number;

/**
 * ของแถมที่ได้ต่อหนึ่งล็อต แปลงเป็นหีบเมื่อทำได้
 *
 * ต้นทางเขียนอัตราเป็น "ต่อ from หีบ ได้ premiumQty หน่วย" แต่เงื่อนไขจริงคือต้องครบ
 * ล็อตละ tierMinQty หีบ จึงต้องคูณกลับก่อน (BSWN: 6 ชิ้น/หีบ × 24 หีบ = 144 ชิ้น)
 *
 * PREMIUMUNIT เป็น B อยู่แล้ว 26 แถว (เป็นหีบ ห้ามหารซ้ำ) ที่เหลือเป็น P (ชิ้น)
 * แปลงเป็นหีบเฉพาะตอนที่หารลงตัว — มี 32 แถวที่ได้ไม่ถึงหีบเต็ม (เช่น BSBSN
 * ซื้อ 6 หีบ ได้ 72 ชิ้น = ครึ่งหีบ) พวกนั้นคงหน่วยชิ้นไว้ ดีกว่าโชว์ "0.5 หีบ"
 */
export function premiumPerLot(
  row: PromoRow,
  packSizeOf?: PackSizeResolver
): { qty: number; unit: string } {
  const from = row.fromQty > 0 ? row.fromQty : 1;
  const raw = row.premiumQty * (tierMinQty(row) / from);
  if ((row.premiumUnit || "").toUpperCase() === "B") {
    return { qty: raw, unit: "B" };
  }
  const pack = packSizeOf?.(row.premiumProduct) ?? 1;
  if (pack > 1 && raw % pack === 0) return { qty: raw / pack, unit: "B" };
  return { qty: raw, unit: row.premiumUnit };
}

export function activePromoRowAtQty(
  rows: PromoRow[],
  qty: number
): PromoRow | null {
  // เทียบกับ tierMinQty ไม่ใช่ fromQty — ขั้นที่มี MINIMUMPURCHASE ยังไม่ active
  // จนกว่าจะซื้อถึงขั้นต่ำจริง
  const sorted = [...rows].sort((a, b) => tierMinQty(a) - tierMinQty(b));
  let active: PromoRow | null = null;
  for (const r of sorted) {
    if (qty >= tierMinQty(r)) active = r;
    else break;
  }
  return active;
}

function activeTier(rows: PromoRow[], pooledQty: number): PromoRow | null {
  return activePromoRowAtQty(rows, pooledQty);
}

/** ของแถมขั้นบันได / หน่วยของแถม — re-export จาก calculations (client-safe) */
export { calcStepPremiumQty, formatPremiumUnit };

export function lookupC4(
  lines: C4Line[],
  opts: {
    division: string;
    cusgroup: string;
    region: string;
    day?: Date;
    promo: PromotionCredit;
    /** ใช้แปลงของแถมจากชิ้นเป็นหีบ — ไม่ส่งมาก็ยังคำนวณได้ แค่คงหน่วยต้นทาง */
    packSizeOf?: PackSizeResolver;
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
      (a, b) => tierMinQty(a) - tierMinQty(b) || a.toQty - b.toQty
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
      // ล็อตละ tierMinQty หีบ ได้ของแถม perLot ต่อล็อต — เศษที่ไม่ครบล็อตไม่นับ
      const lot = tierMinQty(active);
      const perLot = premiumPerLot(active, opts.packSizeOf);
      const freeQty = calcStepPremiumQty(pooledQty, lot, perLot.qty);
      if (freeQty > 0) {
        const firstItemId = pool.lines[0]?.itemId;
        result.freeGoods.push({
          poolKey,
          premiumProduct: active.premiumProduct,
          qty: freeQty,
          unit: perLot.unit,
          reason: `buy ${pooledQty} → ${freeQty} free ${active.premiumProduct} (lot ${lot}, ×${perLot.qty})`,
        });
        const host = result.lines.find(
          (ln) => ln.poolKey === poolKey && ln.itemId === firstItemId
        );
        if (host) {
          host.freeGood = {
            premiumProduct: active.premiumProduct,
            qty: freeQty,
            unit: perLot.unit,
            tierFromQty: lot,
            tierPremiumQty: perLot.qty,
            pooledQty,
          };
        }
      }
    }
  }

  return result;
}

function formatDiscAmt(amt: number): string {
  return amt.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDiscPct(pct: number): string {
  return pct.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPromoDiscount(
  row: PromoRow,
  packSizeOf?: PackSizeResolver
): string {
  if (row.discAmt > 0) return `${formatDiscAmt(row.discAmt)} บาท/หีบ`;
  if (row.discPct > 0) return `${formatDiscPct(row.discPct)}%`;
  if (hasPremium(row)) {
    // จำนวนต่อล็อต ไม่ใช่อัตราต่อหีบดิบ ๆ — ให้ตรงกับเงื่อนไขที่ร้านต้องทำจริง
    const perLot = premiumPerLot(row, packSizeOf);
    return `แถม ${row.premiumProduct} ×${perLot.qty} ${formatPremiumUnit(perLot.unit)}`;
  }
  return "";
}

export function isEmptyBenefitRow(row: PromoRow): boolean {
  return row.discAmt <= 0 && row.discPct <= 0 && !hasPremium(row);
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
  return "none";
}

/**
 * แปลงแถว C4 เป็นขั้นบันไดที่ปลายทางใช้
 *
 * minQty ที่ออกไปคือ "จำนวนจริงที่ต้องซื้อ" (tierMinQty) ไม่ใช่ fromQty ดิบ ๆ
 * ปลายทางทุกตัวเทียบ qty กับ minQty อยู่แล้ว การใส่ค่าที่ถูกตั้งแต่ตรงนี้จึงทำให้
 * ทั้งการ active ขั้น การนับล็อตของแถม และข้อความที่แสดง ตรงกันหมดโดยไม่ต้องแก้ทีละที่
 */
export function promoRowsToTiers(
  rows: PromoRow[],
  packSizeOf?: PackSizeResolver
): PromoTierInput[] {
  const seen = new Set<number>();
  const tiers: PromoTierInput[] = [];
  for (const r of rows) {
    const minQty = tierMinQty(r);
    if (seen.has(minQty)) continue;
    seen.add(minQty);
    const kind = tierKind(r);
    const perLot = kind === "premium" ? premiumPerLot(r, packSizeOf) : null;
    tiers.push({
      minQty,
      discount: formatPromoDiscount(r, packSizeOf),
      sortOrder: minQty,
      kind,
      discBaht: r.discAmt > 0 ? r.discAmt : undefined,
      discPct: r.discPct > 0 ? r.discPct : undefined,
      premiumProduct: kind === "premium" ? r.premiumProduct : undefined,
      premiumQty: perLot?.qty,
      premiumUnit: perLot?.unit,
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
