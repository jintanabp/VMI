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
  /** แถวโปรที่ pool ไว้แล้วต่อ poolKey — ให้ผู้เรียกใช้ชุดเดียวกันสร้างข้อความ/ขั้นบันได
   *  จะไม่ได้ผลลัพธ์คนละชุดกับตัวเลขส่วนลดที่คิดจากตรงนี้ */
  poolRows: Map<string, PromoRow[]>;
}

/** ชิ้นต่อหีบของสินค้าของแถม — ไม่ส่งมา = ไม่แปลงหน่วย */
export type PackSizeResolver = (productCode: string) => number;

/**
 * ตัวช่วยเติมข้อมูลสินค้าของแถมจาก SKU master
 *
 * ชื่อสินค้าต้องมาจากที่นี่ที่เดียว — เดิมผู้เรียกบางรายมา .map() เติม premiumName
 * เองทีหลัง ที่ไม่ได้เติมก็เลยโชว์เป็นรหัสเปล่า ๆ ("แถม 429001 ×1") ซึ่งร้านอ่านไม่ออก
 */
export interface PromoTierOptions {
  packSizeOf?: PackSizeResolver;
  nameOf?: (productCode: string) => string;
}

/**
 * ล็อตของแถม: ซื้อครบ lot หีบ ได้ของแถม qty หน่วย
 *
 * ต้นทางเขียนอัตราเป็น "ต่อ from หีบ ได้ premiumQty หน่วย" ล็อตขั้นต่ำคือ tierMinQty หีบ
 * (MINIMUMPURCHASE เป็นชิ้น แปลงเป็นหีบมาแล้ว)
 *
 * VDA ขายเป็นหีบ และแถมเป็นหีบเต็มเท่านั้น (ผู้ใช้ยืนยัน 15 ต.ค. 69) ของแถมที่เป็นชิ้น (P)
 * จึงต้องสะสมจนครบหีบก่อน — ขยายล็อตจนชิ้นที่ได้หารขนาดหีบของแถมลงตัว
 * BSWN: หีบละ 6 ชิ้น หีบของแถม 144 ชิ้น → ล็อต 24 หีบ แถม 1 หีบ
 *
 * PREMIUMUNIT = B เป็นหีบอยู่แล้ว ห้ามหารซ้ำ · ไม่รู้ขนาดหีบของแถม = คงเป็นชิ้นตามต้นทาง
 */
export function premiumPerLot(
  row: PromoRow,
  packSizeOf?: PackSizeResolver
): { qty: number; unit: string; lot: number } {
  const from = row.fromQty > 0 ? row.fromQty : 1;
  const lot = tierMinQty(row);
  const raw = row.premiumQty * (lot / from);
  if ((row.premiumUnit || "").toUpperCase() === "B") {
    return { qty: raw, unit: "B", lot };
  }
  const pack = packSizeOf?.(row.premiumProduct) ?? 1;
  if (pack > 1 && Number.isInteger(raw) && raw > 0) {
    // จำนวนล็อตน้อยสุดที่ทำให้ชิ้นรวมเป็นหีบเต็มพอดี
    const k = pack / gcd(raw, pack);
    return { qty: (raw * k) / pack, unit: "B", lot: lot * k };
  }
  return { qty: raw, unit: row.premiumUnit, lot };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
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
  const result: C4LookupResult = {
    lines: [],
    freeGoods: [],
    skipped: [],
    poolRows: new Map(),
  };

  const pools = new Map<
    string,
    { lines: C4Line[]; rows: PromoRow[] }
  >();

  for (const ln of lines) {
    // ต้องกรองช่วงแบบเดียวกับ filterCandidateRows — ไม่งั้นหน้าสต็อกกับตอนคิดจริง
    // จะใช้คนละโปรเมื่อมีโปรแทรก แล้วตัวเลขที่ร้านเห็นกับที่ส่งไม่ตรงกัน
    const cands = preferInsertedWindow(
      opts.promo
        .rowsFor(opts.division, opts.cusgroup, ln.product)
        .filter((r) => promoActiveOn(r, day) && promoServesRegion(r, region))
    );

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
    // เก็บไว้ให้ผู้เรียกสร้างข้อความ/ขั้นบันไดจากแถวชุดเดียวกันนี้เสมอ
    // แม้ pool นี้จะยังไม่มีขั้น active (ต่ำกว่าขั้นแรก/เกินขั้นสูงสุด) ก็ยังมีประโยชน์
    result.poolRows.set(poolKey, sortedRows);
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
      // ล็อตละ perLot.lot หีบ ได้ของแถม perLot.qty ต่อล็อต — เศษที่ไม่ครบล็อตไม่นับ
      const perLot = premiumPerLot(active, opts.packSizeOf);
      const lot = perLot.lot;
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
  opts?: PromoTierOptions
): string {
  if (row.discAmt > 0) return `${formatDiscAmt(row.discAmt)} บาท/หีบ`;
  if (row.discPct > 0) return `${formatDiscPct(row.discPct)}%`;
  if (hasPremium(row)) {
    // จำนวนต่อล็อต ไม่ใช่อัตราต่อหีบดิบ ๆ — ให้ตรงกับเงื่อนไขที่ร้านต้องทำจริง
    const perLot = premiumPerLot(row, opts?.packSizeOf);
    const name = opts?.nameOf?.(row.premiumProduct) || row.premiumProduct;
    return `แถม ${name} ×${perLot.qty} ${formatPremiumUnit(perLot.unit)}`;
  }
  return "";
}

export function isEmptyBenefitRow(row: PromoRow): boolean {
  return row.discAmt <= 0 && row.discPct <= 0 && !hasPremium(row);
}

/** ความยาวช่วงโปรเป็นวัน — ไม่มีวันที่ = เปิดปลาย ถือว่ากว้างสุด */
function windowSpanDays(row: PromoRow): number {
  if (!row.fromDate || !row.toDate) return Number.POSITIVE_INFINITY;
  return Math.round(
    (row.toDate.getTime() - row.fromDate.getTime()) / 86_400_000
  );
}

/**
 * โปรที่แทรกเข้ามาชนะโปรช่วงกว้าง
 *
 * สินค้าตัวหนึ่งมีได้หลายแถวที่ active พร้อมกัน — ช่วงยาวคือโปรประจำเดือน ส่วนช่วงสั้น
 * คือโปรที่แทรกเข้ามาทีหลังสำหรับบางสัปดาห์ ตัวที่แทรกคือตัวที่ต้องใช้
 *
 * เดิมไม่มีกฎเลย: promoRowsToTiers dedupe ตาม minQty แบบใครมาก่อนได้ก่อน ผลลัพธ์จึง
 * ขึ้นกับลำดับแถวในไฟล์ ซึ่งเดาไม่ได้และสลับกันเองได้ระหว่างรอบ sync
 *
 * เลือกยกช่วง ไม่ใช่เลือกทีละขั้น — โปรที่แทรกมาแทนเงื่อนไขเดิมทั้งก้อน ถ้าหยิบขั้นแรก
 * จากโปรใหม่แล้วขั้นสูงจากโปรเก่า จะได้บันไดผสมที่ไม่มีอยู่จริงสักอัน
 */
export function preferInsertedWindow(rows: PromoRow[]): PromoRow[] {
  if (rows.length <= 1) return rows;
  const spans = rows.map(windowSpanDays);
  const narrowest = Math.min(...spans);
  if (!Number.isFinite(narrowest)) return rows;

  const winners = rows.filter((_, i) => spans[i] === narrowest);

  // ยาวเท่ากันแต่คนละช่วง = อันที่เริ่มทีหลังคือตัวที่แทรกเข้ามาล่าสุด
  // ส่วนขั้นบันไดของโปรเดียวกันมี from/to เท่ากันหมด จึงรอดครบทุกขั้นเอง
  const latestStart = Math.max(
    ...winners.map((r) => r.fromDate?.getTime() ?? 0)
  );
  return winners.filter((r) => (r.fromDate?.getTime() ?? 0) === latestStart);
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
  return preferInsertedWindow(
    promo
      .rowsFor(division, cusgroup, product)
      .filter((r) => promoActiveOn(r, day) && promoServesRegion(r, normRegion))
  );
}

export function tierKind(row: PromoRow): PromoTierKind {
  if (isStepTier(row) && hasPremium(row)) return "premium";
  if (row.discAmt > 0) return "discount_baht";
  if (row.discPct > 0) return "discount_pct";
  return "none";
}

/**
 * แถวไหน "คุ้ม" กว่ากัน — เทียบชนิดก่อน (ลดบาท > ลด% > ของแถม > ไม่มีอะไร)
 * แล้วค่อยเทียบขนาดภายในชนิดเดียวกัน
 *
 * ใช้ตัดสินตอนสองแถวชนกันที่ tierMinQty เดียวกัน (ดู promoRowsToTiers) — ไม่ใช้
 * เทียบลำดับขั้นบันไดปกติ (นั่นใช้ minQty ตรงๆ อยู่แล้ว)
 */
function tierBenefitRank(row: PromoRow): [number, number] {
  if (row.discAmt > 0) return [3, row.discAmt];
  if (row.discPct > 0) return [2, row.discPct];
  if (hasPremium(row)) return [1, row.premiumQty];
  return [0, 0];
}

function isBetterTierRow(a: PromoRow, b: PromoRow): boolean {
  const [aKind, aVal] = tierBenefitRank(a);
  const [bKind, bVal] = tierBenefitRank(b);
  if (aKind !== bKind) return aKind > bKind;
  return aVal > bVal;
}

/**
 * แปลงแถว C4 เป็นขั้นบันไดที่ปลายทางใช้
 *
 * minQty ที่ออกไปคือ "จำนวนจริงที่ต้องซื้อ" (tierMinQty) ไม่ใช่ fromQty ดิบ ๆ
 * ปลายทางทุกตัวเทียบ qty กับ minQty อยู่แล้ว การใส่ค่าที่ถูกตั้งแต่ตรงนี้จึงทำให้
 * ทั้งการ active ขั้น การนับล็อตของแถม และข้อความที่แสดง ตรงกันหมดโดยไม่ต้องแก้ทีละที่
 *
 * บั๊กที่เจอจริง: แถว "1-2 หีบ" (fromQty=1, toQty=2, ลด 63) บางกลุ่มมี MINIMUMPURCHASE=6
 * แปลว่า tierMinQty จริงคือ 6 — ชนกับแถว "6+ หีบ" (fromQty=6, ลด 140) ที่ tierMinQty ก็เป็น 6
 * เหมือนกัน ของเดิมเอาแถว "ที่เจอก่อน" (first-seen) ซึ่งมักเป็นแถวช่วงแคบที่ให้น้อยกว่า
 * ทำให้ร้านที่สั่งครบ 6 เห็นข้อความ "ลด 63 ขั้นสูงสุด" ทั้งที่ตัวเลขที่คิดจริง (คนละฟังก์ชัน,
 * lookupC4/activeTier) ได้ 140 ถูกต้อง — ร้านที่เข้าเกณฑ์ขั้นหนึ่งต้องไม่เห็นขั้นที่ด้อยกว่า
 * เพราะลำดับแถวในไฟล์ จึงต้องเลือกแถวที่ "คุ้มกว่า" เมื่อ minQty ชนกัน ไม่ใช่แถวแรกที่เจอ
 */
export function promoRowsToTiers(
  rows: PromoRow[],
  opts?: PromoTierOptions
): PromoTierInput[] {
  const byMinQty = new Map<number, PromoRow>();
  for (const r of rows) {
    const minQty = tierMinQty(r);
    const existing = byMinQty.get(minQty);
    if (!existing || isBetterTierRow(r, existing)) {
      byMinQty.set(minQty, r);
    }
  }
  const tiers: PromoTierInput[] = [];
  for (const [rowMinQty, r] of byMinQty) {
    const kind = tierKind(r);
    const perLot = kind === "premium" ? premiumPerLot(r, opts?.packSizeOf) : null;
    // ของแถมต้องสะสมครบหีบเต็มก่อน — ขั้นจึงเริ่มที่ล็อตของแถม ไม่ใช่ขั้นต่ำดิบ
    const minQty = perLot ? perLot.lot : rowMinQty;
    tiers.push({
      minQty,
      discount: formatPromoDiscount(r, opts),
      sortOrder: minQty,
      kind,
      discBaht: r.discAmt > 0 ? r.discAmt : undefined,
      discPct: r.discPct > 0 ? r.discPct : undefined,
      premiumProduct: kind === "premium" ? r.premiumProduct : undefined,
      premiumName:
        kind === "premium"
          ? opts?.nameOf?.(r.premiumProduct) || r.premiumProduct
          : undefined,
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
