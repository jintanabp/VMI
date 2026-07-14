import fs from "fs";
import { readCsvFile } from "./csv";
import { bangkokDateStr, isoDateStr } from "./bkk-date";

const REQUIRED = [
  "DIVISIONSALE",
  "PRODUCTCODE",
  "CUSTOMERGROUP",
  "PURCHASEQUANTITYFROM",
  "PURCHASEQUANTITYTO",
] as const;

const REGIONS = [
  "BANGKOK",
  "CENTRAL",
  "NORTHEAST",
  "NORTH",
  "SOUTH",
  "COUNTRY",
] as const;

function toInt(v: string | undefined): number {
  const s = (v ?? "0").replace(/,/g, "");
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(v: string | undefined): number {
  const s = (v ?? "0").replace(/,/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: string | undefined): Date | null {
  const s = (v ?? "").slice(0, 10);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

export interface PromoRow {
  division: string;
  product: string;
  cusgroup: string;
  poolKey: string;
  fromQty: number;
  toQty: number;
  unit: string;
  discAmt: number;
  discPct: number;
  premiumProduct: string;
  premiumQty: number;
  premiumUnit: string;
  regions: Set<string>;
  fromDate: Date | null;
  toDate: Date | null;
  raw: Record<string, string>;
}

export function isStepTier(row: PromoRow): boolean {
  return row.fromQty === row.toQty;
}

export function hasPremium(row: PromoRow): boolean {
  return (
    row.premiumProduct !== "" &&
    row.premiumProduct.toUpperCase() !== "NULL" &&
    row.premiumProduct !== "0" &&
    row.premiumQty > 0
  );
}

export function promoActiveOn(row: PromoRow, day: Date): boolean {
  // เทียบเป็นวันที่โซนไทย (inclusive ทั้งวันเริ่ม-วันสิ้นสุด) กัน off-by-one/เลื่อน 7 ชม.
  const d = bangkokDateStr(day);
  if (row.fromDate && d < isoDateStr(row.fromDate)) return false;
  if (row.toDate && d > isoDateStr(row.toDate)) return false;
  return true;
}

export function promoServesRegion(row: PromoRow, region: string): boolean {
  return row.regions.has("COUNTRY") || row.regions.has(region);
}

function parsePromoRow(norm: Record<string, string>): PromoRow | null {
  const division = norm.DIVISIONSALE ?? "";
  const product = norm.PRODUCTCODE ?? "";
  const cusgroup = norm.CUSTOMERGROUP ?? "";
  if (!division || !product || !cusgroup) return null;

  const regions = new Set<string>();
  for (const r of REGIONS) {
    if ((norm[r] ?? "").toUpperCase() === "Y") regions.add(r);
  }

  return {
    division,
    product,
    cusgroup,
    poolKey:
      (norm.POOL_KEY ?? "").trim() ||
      (norm.ASSORTEDPRODUCTGROUP ?? "").trim() ||
      product,
    fromQty: toInt(norm.PURCHASEQUANTITYFROM),
    toQty: toInt(norm.PURCHASEQUANTITYTO),
    unit: norm.PURCHASEUNIT ?? "",
    discAmt: toFloat(norm.DISCOUNTAMOUNT),
    discPct: toFloat(norm.DISCOUNTPERCENT),
    premiumProduct: norm.PREMIUMPRODUCT ?? "",
    premiumQty: toInt(norm.PREMIUMQUANTITY),
    premiumUnit: norm.PREMIUMUNIT ?? "",
    regions,
    fromDate: toDate(norm.FROMDATE),
    toDate: toDate(norm.TODATE),
    raw: norm,
  };
}

export class PromotionCredit {
  private byKey = new Map<string, PromoRow[]>();
  // (division|cusgroup|ASSORTEDPRODUCTGROUP) → rows, สร้างตอน load เพื่อให้ rowsForGroup เป็น O(1)
  private byGroup = new Map<string, PromoRow[]>();
  private csvPath: string | null = null;

  get isLoaded() {
    return this.byKey.size > 0;
  }

  rowsFor(division: string, cusgroup: string, product: string): PromoRow[] {
    return this.byKey.get(`${division}|${cusgroup}|${product}`) ?? [];
  }

  /** All tier rows under (division, cusgroup) whose ASSORTEDPRODUCTGROUP equals group. */
  rowsForGroup(division: string, cusgroup: string, group: string): PromoRow[] {
    const g = group.trim();
    if (!g) return [];
    return this.byGroup.get(`${division}|${cusgroup}|${g}`) ?? [];
  }

  /** ASSORTEDPRODUCTGROUP for a SKU, if any (empty = standalone SKU promo). */
  assortedGroupFor(division: string, cusgroup: string, product: string): string {
    const rows = this.rowsFor(division, cusgroup, product);
    if (rows.length === 0) return "";
    return (rows[0].raw.ASSORTEDPRODUCTGROUP ?? "").trim();
  }

  hasActivePromoToday(
    division: string,
    cusgroup: string,
    product: string,
    region: string,
    day: Date = new Date()
  ): boolean {
    const normRegion = region.toUpperCase().replace(/\s+/g, "");
    return this.rowsFor(division, cusgroup, product).some(
      (r) => promoActiveOn(r, day) && promoServesRegion(r, normRegion)
    );
  }

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[PromotionCredit] CSV not found: ${csvPath}`);
      this.byKey = new Map();
      this.byGroup = new Map();
      this.csvPath = csvPath;
      return;
    }

    const { headers, rows } = readCsvFile(csvPath);
    const headerSet = new Set(headers.map((h) => h.trim()));
    const missing = REQUIRED.filter((c) => !headerSet.has(c));
    if (missing.length > 0) {
      console.warn(
        `[PromotionCredit] Missing columns ${missing.join(", ")} in ${csvPath}`
      );
      return;
    }

    const byKey = new Map<string, PromoRow[]>();
    for (const row of rows) {
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        norm[k.trim().toUpperCase()] = (v ?? "").trim();
      }
      const parsed = parsePromoRow(norm);
      if (!parsed) continue;
      const key = `${parsed.division}|${parsed.cusgroup}|${parsed.product}`;
      const bucket = byKey.get(key) ?? [];
      bucket.push(parsed);
      byKey.set(key, bucket);
    }

    for (const bucket of byKey.values()) {
      bucket.sort((a, b) => a.fromQty - b.fromQty || a.toQty - b.toQty);
    }

    // index ตาม ASSORTEDPRODUCTGROUP — ให้ rowsForGroup() ไม่ต้อง scan ทั้งชุดต่อ SKU
    const byGroup = new Map<string, PromoRow[]>();
    for (const bucket of byKey.values()) {
      for (const r of bucket) {
        const g = (r.raw.ASSORTEDPRODUCTGROUP ?? "").trim();
        if (!g) continue;
        const key = `${r.division}|${r.cusgroup}|${g}`;
        const list = byGroup.get(key) ?? [];
        list.push(r);
        byGroup.set(key, list);
      }
    }
    for (const list of byGroup.values()) {
      list.sort((a, b) => a.fromQty - b.fromQty || a.toQty - b.toQty);
    }
    this.byGroup = byGroup;

    this.byKey = byKey;
    this.csvPath = csvPath;
    console.info(
      `[PromotionCredit] Loaded ${rows.length} rows / ${byKey.size} keys from ${csvPath}`
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }
}

let promotionCredit: PromotionCredit | null = null;

export function getPromotionCredit(): PromotionCredit {
  if (!promotionCredit) {
    promotionCredit = new PromotionCredit();
  }
  return promotionCredit;
}

export function reloadPromotionCredit(csvPath: string): void {
  promotionCredit = new PromotionCredit();
  promotionCredit.load(csvPath);
}
