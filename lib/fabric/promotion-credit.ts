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
  /**
   * MINIMUMPURCHASE จากไฟล์ต้นทาง — ยอดสั่งขั้นต่ำที่ประกาศไว้แยกจาก fromQty/toQty
   *
   * ตอนนี้เป็น "ข้อมูลประกอบ" เท่านั้น ไม่ได้เอาไปกรองหรือคิดส่วนลด เพราะยังไม่ยืนยัน
   * กฎธุรกิจ — บางกลุ่มเขียน from/to = 1/1 แต่ minPurchase = 24 (เช่น BSWN) ซึ่งถ้า
   * บังคับใช้จะเปลี่ยนตัวเลขที่ลูกค้าเห็นทันที เอาไว้โชว์ให้คนตัดสินก่อน
   */
  minPurchase: number;
  regions: Set<string>;
  fromDate: Date | null;
  toDate: Date | null;
  raw: Record<string, string>;
}

export function isStepTier(row: PromoRow): boolean {
  return row.fromQty === row.toQty;
}

/**
 * จำนวนที่ต้องซื้อจริงถึงจะได้ขั้นนี้ — และเป็น "ขนาดล็อต" ของการทบของแถมด้วย
 *
 * ไฟล์ C4 เขียนขั้นแรกเป็น from=1 ไว้เป็นค่าเริ่มต้นเสมอ แล้วบอกเงื่อนไขจริงแยกไว้ที่
 * MINIMUMPURCHASE (ตรวจไฟล์แล้ว: ทุกแถวที่ min > 0 มี from = 1 ทั้งหมด ไม่มีข้อยกเว้น
 * ส่วนขั้นสูงกว่ามี min = 0 เพราะ from ของมันเองคือเงื่อนไขอยู่แล้ว)
 *
 * เดิมระบบอ่านแต่ from จึงคิดว่า BSWN คือ "ซื้อ 1 หีบ แถม 6 ชิ้น" ทั้งที่ของจริงคือ
 * "สั่งคละ 24 หีบในกลุ่ม แถม 1 หีบ" — ให้ของแถมทั้งที่ยังไม่ถึงขั้นต่ำ และให้เกินจริง
 */
export function tierMinQty(row: PromoRow): number {
  return Math.max(row.fromQty, row.minPurchase);
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
    minPurchase: toInt(norm.MINIMUMPURCHASE),
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
  private lastError: string | null = null;

  get isLoaded() {
    return this.byKey.size > 0;
  }

  /**
   * ข้อความอธิบายว่าโหลดล้มเพราะอะไร (null = ปกติ)
   *
   * โหมดล้มของไฟล์นี้เงียบมาก — คอลัมน์ผิดหรือทุกแถวถูกตีตกจะได้ directory ว่าง
   * ซึ่งปลายทางเห็นเป็นแค่ "ไม่มีโปรสักตัว" โดยไม่มี error ที่ไหนเลย
   */
  get loadError(): string | null {
    return this.lastError;
  }

  rowsFor(division: string, cusgroup: string, product: string): PromoRow[] {
    return this.byKey.get(`${division}|${cusgroup}|${product}`) ?? [];
  }

  /**
   * ทุกแถวใน directory — สำหรับงานที่ต้อง "ไล่ดูทั้งชุด" ไม่ใช่ lookup รายคีย์
   *
   * ที่ต้องมี: rowsFor/rowsForGroup ต้องรู้ (division, cusgroup, product) ก่อน จึงไล่ดู
   * ทั้งไฟล์ไม่ได้เลย งานอย่างรายงานโปรรายเดือนหรือสคริปต์เก็บสถิติเคยต้องเปิด CSV
   * อ่านซ้ำเองทั้งที่ข้อมูลชุดเดียวกัน parse ไว้ในหน่วยความจำอยู่แล้ว
   */
  allRows(): PromoRow[] {
    const out: PromoRow[] = [];
    for (const bucket of this.byKey.values()) out.push(...bucket);
    return out;
  }

  /**
   * รหัสสินค้าทั้งหมดที่มีแถว C4 ในบริบทนี้
   *
   * ใช้หา "สินค้าที่มีโปรแต่ร้านไม่เคยสต็อก" ซึ่งหน้าสต็อกสร้างแถวจาก stock_cover_day
   * อย่างเดียวจึงไม่เคยเห็น — อ่านจากคีย์ของ byKey ตรง ๆ ไม่ต้องไล่ทุกแถว
   */
  productsFor(division: string, cusgroup: string): string[] {
    const prefix = `${division}|${cusgroup}|`;
    const out: string[] = [];
    for (const key of this.byKey.keys()) {
      if (key.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
    return out;
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

  private fail(message: string): void {
    this.lastError = message;
    this.byKey = new Map();
    this.byGroup = new Map();
    console.error(`[PromotionCredit] ${message}`);
  }

  load(csvPath: string): void {
    this.lastError = null;
    // ตั้ง csvPath ตั้งแต่ต้น — เดิม return ก่อนถึงบรรทัดนี้เมื่อคอลัมน์ขาด
    // ทำให้ reload() ครั้งถัดไปโหลด path ว่าง
    this.csvPath = csvPath;

    if (!fs.existsSync(csvPath)) {
      this.fail(`ไม่พบไฟล์โปรโมชั่น: ${csvPath}`);
      return;
    }

    const { headers, rows } = readCsvFile(csvPath);
    // เทียบแบบไม่สนตัวพิมพ์ ให้ตรงกับ normalize ของ row ด้านล่าง
    // (เดิมเทียบตัวพิมพ์เป๊ะ ไฟล์ที่ส่ง header คนละเคสจะดาวน์โหลดผ่านแต่โหลดไม่ขึ้น)
    const headerSet = new Set(headers.map((h) => h.trim().toUpperCase()));
    const missing = REQUIRED.filter((c) => !headerSet.has(c));
    if (missing.length > 0) {
      this.fail(
        `คอลัมน์ที่จำเป็นหายไป [${missing.join(", ")}] ใน ${csvPath} — ` +
          `header ที่พบ: ${headers.map((h) => h.trim()).join(", ")}`
      );
      return;
    }

    const byKey = new Map<string, PromoRow[]>();
    let rowsWithRegion = 0;
    let rowsWithDate = 0;
    for (const row of rows) {
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        norm[k.trim().toUpperCase()] = (v ?? "").trim();
      }
      const parsed = parsePromoRow(norm);
      if (!parsed) continue;
      if (parsed.regions.size > 0) rowsWithRegion++;
      if (parsed.fromDate) rowsWithDate++;
      const key = `${parsed.division}|${parsed.cusgroup}|${parsed.product}`;
      const bucket = byKey.get(key) ?? [];
      bucket.push(parsed);
      byKey.set(key, bucket);
    }

    // มีแถวในไฟล์แต่ไม่ผ่าน parse สักแถว = ลายนิ้วมือของคอลัมน์คีย์ (division/product/cusgroup) ว่าง
    if (rows.length > 0 && byKey.size === 0) {
      this.fail(
        `อ่านไฟล์ได้ ${rows.length} แถว แต่ parse ไม่ผ่านสักแถวจาก ${csvPath} — ` +
          `ตรวจว่า DIVISIONSALE / PRODUCTCODE / CUSTOMERGROUP มีค่าจริงหรือไม่`
      );
      return;
    }

    // isLoaded ยังเป็น true ในสองเคสนี้ ปลายทางจึงไม่มีอะไรเตือน ต้อง log ให้เห็นเอง
    if (byKey.size > 0 && rowsWithRegion === 0) {
      console.error(
        `[PromotionCredit] ทุกแถวไม่มีภูมิภาคที่ให้บริการ (COUNTRY/BANGKOK/... ไม่มีค่า "Y") ` +
          `จาก ${csvPath} — promoServesRegion จะ false ทุกแถว = ไม่มีโปรที่ไหนเลย`
      );
    }
    if (byKey.size > 0 && rowsWithDate === 0) {
      console.warn(
        `[PromotionCredit] ไม่มีแถวไหน parse FROMDATE ได้จาก ${csvPath} — ` +
          `โปรทุกตัวจะถือว่ายังไม่หมดอายุตลอดไป`
      );
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
    console.info(
      `[PromotionCredit] Loaded ${rows.length} rows / ${byKey.size} keys / ${byGroup.size} groups from ${csvPath}`
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }
}
