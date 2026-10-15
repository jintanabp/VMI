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

export const REGIONS = [
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
   * บังคับใช้จริงแล้วผ่าน tierMinQty() ทั้งเงื่อนไขและขนาดล็อตของแถม
   * อย่าอ่านค่านี้ตรง ๆ เพื่อตัดสินว่าถึงขั้นหรือยัง ให้ผ่าน tierMinQty() เสมอ
   */
  minPurchase: number;
  /**
   * MINIMUMPURCHASE แปลงเป็นหีบแล้ว (ปัดขึ้น) — เติมโดย PromotionCredit.applyPackSizes
   * ไม่มีค่า = ยังไม่รู้ขนาดหีบ ถอยไปใช้ minPurchase ตรง ๆ (เข้มกว่าของจริง ไม่ให้เกิน)
   */
  minPurchaseCases?: number;
  regions: Set<string>;
  fromDate: Date | null;
  toDate: Date | null;
  raw: Record<string, string>;
}

export function isStepTier(row: PromoRow): boolean {
  return row.fromQty === row.toQty;
}

/**
 * จำนวนหีบที่ต้องซื้อจริงถึงจะได้ขั้นนี้ — และเป็นขนาดล็อตของการทบของแถมด้วย
 *
 * MINIMUMPURCHASE เป็น "ชิ้น" เสมอ ทั้งโปรลดราคาและโปรของแถม (PREMIUMUNIT เป็นหน่วยของ
 * ของแถมอย่างเดียว ไม่เกี่ยวกับขั้นต่ำ — ผู้ใช้ยืนยัน 15 ต.ค. 69) ต้องแปลงเป็นหีบก่อน
 * ผ่าน PromotionCredit.applyPackSizes ซึ่งเติม minPurchaseCases ให้
 *
 * เดิมอ่านเป็นหีบตรง ๆ 260927 (ลด 46 ขั้นต่ำ 12 ชิ้น หีบละ 72) จึงต้องสั่งถึง 12 หีบ
 * ร้านไม่เคยได้ส่วนลด · ยังไม่รู้ขนาดหีบ = ถอยไปใช้ตัวเลขดิบ (เข้มกว่าของจริง ไม่ให้เกิน)
 *
 * TOBREAKUP=Y แปลว่าทอนหีบขายแยกชิ้นได้ แต่ VDA สั่งเป็นหีบเต็มเสมอ จึงยังไม่ได้ใช้
 */
export function tierMinQty(row: PromoRow): number {
  return Math.max(row.fromQty, row.minPurchaseCases ?? row.minPurchase);
}

/** ชิ้น → หีบ ปัดขึ้น (VDA สั่งเป็นหีบเต็ม) — ไม่รู้ขนาดหีบ = คงตัวเลขเดิมไว้ */
export function minPurchaseInCases(minPurchase: number, packSize: number): number {
  if (minPurchase <= 0) return 0;
  if (!(packSize > 1)) return minPurchase;
  return Math.ceil(minPurchase / packSize);
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

/**
 * แถวนี้ใช้ได้กับภาคของร้านหรือไม่
 *
 * `COUNTRY=Y` แปลว่า "ได้ทั้งประเทศ" จึงผ่านเสมอไม่ว่าร้านอยู่ภาคไหน ส่วนแถวที่ไม่ได้ติด
 * COUNTRY จะได้เฉพาะภาคที่ติด Y ไว้ (ในไฟล์เดือน ส.ค. 2026 มี 61 แถวแบบนี้)
 *
 * normalize ในนี้เลย ไม่ปล่อยให้ผู้เรียกรับผิดชอบ — dim_customer เขียนภาคอีสานว่า
 * "NORTH EAST" (มีช่องว่าง) ส่วนหัวคอลัมน์ใน C4 คือ "NORTHEAST" ถ้าลืม normalize
 * ที่ใดที่หนึ่ง ร้านอีสานจะไม่เห็นโปรเฉพาะภาคแบบเงียบ ๆ
 */
export function promoServesRegion(row: PromoRow, region: string): boolean {
  if (row.regions.has("COUNTRY")) return true;
  return row.regions.has(normalizeRegionName(region));
}

/** "north east" → "NORTHEAST" — ต้องให้ผลเดียวกับ normalizeRegion ใน promotion-lookup */
export function normalizeRegionName(region: string): string {
  return (region || "").toUpperCase().replace(/\s+/g, "");
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
  /** (division, cusgroup) ที่มีจริงในไฟล์ — เก็บตอนโหลด ปลายทางถามบ่อยแต่ไม่เคยเปลี่ยนระหว่างรอบ */
  private ctxList: { division: string; cusgroup: string }[] = [];
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

  /**
   * บริบททั้งหมดที่มีในไฟล์ — ยาวเท่ากับจำนวนชุดที่ต้นทางซอยไว้
   *
   * ตาราง cash ที่ใช้จริงมีชุดเดียว (E|98) ปลายทางจึงเดาบริบทถูกเองได้โดยไม่ต้องตั้ง env
   * ส่วนตาราง credit เก่ามี 7 ชุด — ถ้าเห็นความยาวมากกว่า 1 แปลว่ากำลังถือไฟล์ผิดใบอยู่
   */
  contexts(): { division: string; cusgroup: string }[] {
    return this.ctxList;
  }

  private fail(message: string): void {
    this.lastError = message;
    this.byKey = new Map();
    this.byGroup = new Map();
    this.ctxList = [];
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
    this.ctxList = [
      ...new Set(
        [...byKey.values()].map((b) => `${b[0]!.division}|${b[0]!.cusgroup}`)
      ),
    ].map((k) => {
      const [division, cusgroup] = k.split("|");
      return { division: division!, cusgroup: cusgroup! };
    });
    console.info(
      `[PromotionCredit] Loaded ${rows.length} rows / ${byKey.size} keys / ${byGroup.size} groups / ` +
        `${this.ctxList.length} บริบท (${this.ctxList.map((c) => `${c.division}|${c.cusgroup}`).join(", ")}) from ${csvPath}`
    );
  }

  /**
   * แปลง MINIMUMPURCHASE ที่เป็นชิ้นให้เป็นหีบด้วยขนาดหีบจาก SKU master
   *
   * แยกจาก load() เพราะไฟล์โปรกับ SKU master โหลดคนละจังหวะ — เรียกซ้ำได้เสมอ
   * แถวที่ยังไม่รู้ขนาดหีบจะไม่มี minPurchaseCases แล้ว tierMinQty ถอยไปค่าเดิม
   */
  applyPackSizes(packSizeOf: (productCode: string) => number): void {
    let converted = 0;
    for (const bucket of this.byKey.values()) {
      for (const r of bucket) {
        if (r.minPurchase <= 0) {
          r.minPurchaseCases = 0;
          continue;
        }
        const pack = packSizeOf(r.product);
        if (pack > 1) {
          r.minPurchaseCases = minPurchaseInCases(r.minPurchase, pack);
          converted++;
        } else {
          delete r.minPurchaseCases;
        }
      }
    }
    console.info(`[PromotionCredit] แปลงขั้นต่ำชิ้น→หีบ ${converted} แถว`);
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }
}
