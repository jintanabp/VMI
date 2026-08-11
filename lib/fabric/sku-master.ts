import fs from "fs";
import { streamCsvFile } from "./csv";
import { bangkokDateStr, isoDateStr } from "./bkk-date";

/**
 * ราคาหนึ่งช่วงวันที่ของสินค้าหนึ่งรหัส
 *
 * โครงของไฟล์ master ที่ต้องรู้ก่อนแตะราคา — หนึ่งรหัสสินค้ามีหลายแถวตาม PRODUCTSIZE
 * (0 = หีบ, 1 = แพ็ค, 9 = ชิ้น) โดย:
 *   - CREDITUNITPRICE / CASHUNITPRICE เป็นราคา "ต่อขนาดของแถวนั้น" (หีบ 900, ชิ้น 90)
 *   - CreditPrice เป็นคอลัมน์สรุป "ราคาต่อหีบ" ที่ซ้ำเหมือนกันทุกแถวของรหัสนั้น
 *
 * ทั้งแอปคิดเป็นหีบ ราคาเงินสดต่อหีบจึงต้องอ่านจากแถว PRODUCTSIZE = 0 เท่านั้น
 * ถ้าหยิบแถวไหนก็ได้จะได้ราคาชิ้นมาแทน (เจอตอนสลับมาใช้ cash: 900 กลายเป็น 90)
 */
export interface PriceRecord {
  fromDate: Date;
  toDate: Date;
  /** ราคาเงินสด/หีบ — มีค่าเฉพาะแถวหีบ (PRODUCTSIZE = 0) */
  cashCasePrice: number;
  /** ราคาเครดิต/หีบ จากคอลัมน์สรุป CreditPrice — ใช้เป็นทางถอยเมื่อไม่มีราคาเงินสด */
  creditCasePrice: number;
  /** แถวนี้คือแถวหีบหรือไม่ */
  isCaseRow: boolean;
}

export interface SkuMasterRow {
  productCode: string;
  barcode: string;
  name: string;
  section: string;
  brand: string;
}

export interface SkuMeta {
  barcode: string;
  section: string;
  brand: string;
  /** ชิ้นต่อหีบ จาก PackingSize — 1 เมื่อ master ไม่มีค่า (ถือว่านับเป็นหีบอยู่แล้ว) */
  packSize: number;
}

function splitCodeName(value: string): string {
  const s = value.trim();
  if (!s.includes(" - ")) return s;
  return s.split(" - ").slice(1).join(" - ").trim() || s;
}

function parseDate(raw: string | undefined): Date | null {
  const s = (raw ?? "").slice(0, 10);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function parseNum(raw: string | undefined): number {
  const s = (raw ?? "").replace(/,/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export class SkuMasterDirectory {
  private loadedCount = 0;
  private nameByCode = new Map<string, string>();
  private metaByCode = new Map<string, SkuMeta>();
  private pricesByCode = new Map<string, PriceRecord[]>();
  private csvPath: string | null = null;

  get isLoaded() {
    return this.loadedCount > 0;
  }

  nameForSku(code: string): string {
    return this.nameByCode.get(code.trim()) ?? "";
  }

  metaForSku(code: string): SkuMeta | null {
    return this.metaByCode.get(code.trim()) ?? null;
  }

  barcodeForSku(code: string): string {
    return this.metaByCode.get(code.trim())?.barcode ?? "";
  }

  sectionForSku(code: string): string {
    return this.metaByCode.get(code.trim())?.section ?? "";
  }

  brandForSku(code: string): string {
    return this.metaByCode.get(code.trim())?.brand ?? "";
  }

  /** ชิ้นต่อหีบ — คืน 1 เมื่อไม่มีข้อมูล เพื่อให้การหารปลอดภัยเสมอ */
  packSizeForSku(code: string): number {
    return this.metaByCode.get(code.trim())?.packSize ?? 1;
  }

  /**
   * ราคา/หีบ ที่ระบบใช้ = ราคาเงินสดของแถวหีบ (CASHUNITPRICE ที่ PRODUCTSIZE = 0)
   *
   * ทั้งแอปคิดบนโปร C4 ชุด cash (cft_promotion_cash.csv) ราคาฐานจึงต้องเป็นเงินสด
   * ให้เข้าชุดกัน เดิมคืนราคาเครดิตซึ่งไม่ตรงกับโปรที่เอามาลด
   *
   * ต้องกรองเอาเฉพาะแถวหีบก่อนเลือกตามวันที่ ไม่ใช่เลือกตามวันที่แล้วค่อยอ่านราคา —
   * ถ้าแถวชิ้น/แพ็คชนะ tie-break จะได้ราคาชิ้นมาแทน (900 กลายเป็น 90)
   * เดิมไม่เจอปัญหานี้เพราะอ่านคอลัมน์สรุป CreditPrice ซึ่งเป็นราคาหีบเท่ากันทุกแถว
   */
  getLookupPrice(
    productCode: string,
    on: Date = new Date()
  ): { price: number | null; expired: boolean } {
    const code = productCode.trim();
    const all = this.pricesByCode.get(code) ?? [];
    if (all.length === 0) return { price: null, expired: false };

    // แถวหีบเท่านั้น — ถ้ารหัสนี้ไม่มีแถวหีบเลย ค่อยถอยไปใช้คอลัมน์สรุปจากแถวอื่น
    const caseRows = all.filter((r) => r.isCaseRow);
    const candidates = caseRows.length > 0 ? caseRows : all;
    const priceOf = (r: PriceRecord) =>
      r.cashCasePrice > 0
        ? r.cashCasePrice
        : r.creditCasePrice > 0
          ? r.creditCasePrice
          : null;

    // เทียบเป็นวันที่โซนไทย (inclusive) กัน off-by-one/เลื่อน 7 ชม. ให้ตรงกับ promoActiveOn
    const onStr = bangkokDateStr(on);
    const active = candidates.filter(
      (r) => isoDateStr(r.fromDate) <= onStr && onStr <= isoDateStr(r.toDate)
    );
    if (active.length > 0) {
      const best = active.reduce((a, b) =>
        a.fromDate > b.fromDate ? a : b
      );
      return { price: priceOf(best), expired: false };
    }

    const expired = candidates.filter((r) => isoDateStr(r.toDate) < onStr);
    if (expired.length > 0) {
      const best = expired.reduce((a, b) => (a.toDate > b.toDate ? a : b));
      return { price: priceOf(best), expired: true };
    }

    return { price: null, expired: false };
  }

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[SkuMaster] CSV not found: ${csvPath}`);
      this.loadedCount = 0;
      this.csvPath = csvPath;
      return;
    }

    const nameByCode = new Map<string, string>();
    const metaByCode = new Map<string, SkuMeta>();
    const pricesByCode = new Map<string, PriceRecord[]>();
    let count = 0;

    // stream ทีละแถว — ไม่เก็บ array 110k แถว, คีย์ถูก lower-case ให้แล้ว (n = row)
    streamCsvFile(csvPath, (n) => {
      const productCode =
        n.productcode || n.sku || n.product_code || n.item_code || "";
      if (!productCode) return;

      const barcode = n.barcode || n.ean || "";
      const name =
        n.name ||
        n.product_name ||
        splitCodeName(n.productcode_name || "") ||
        productCode;
      // Section (product group) จาก Dim_Product ที่ join มาใน item_barcode_map_v2
      const section =
        splitCodeName(n.sectioncode_name || "") ||
        n.section ||
        "";
      const brand =
        splitCodeName(n.brandcode_name || "") ||
        n.brand_namethai ||
        n.brand_nameenglish ||
        n.brand ||
        "";
      // ชิ้นต่อหีบ — stock_cover_day นับเป็นชิ้น แต่ราคา/โปร C4 นับเป็นหีบ
      const packSize =
        Math.max(1, Math.round(parseNum(n.packingsize || n.pack_size))) || 1;

      count++;
      if (!nameByCode.has(productCode)) {
        nameByCode.set(productCode, name);
      }
      if (!metaByCode.has(productCode)) {
        metaByCode.set(productCode, { barcode, section, brand, packSize });
      }

      // คอลัมน์สรุประดับหีบ ซ้ำเท่ากันทุกแถวของรหัสนี้
      const creditCasePrice = parseNum(
        n.creditprice || n.credit_price || n.price || ""
      );
      // ราคาต่อขนาดของแถวนี้ — เป็นราคาต่อหีบก็ต่อเมื่อเป็นแถว PRODUCTSIZE = 0
      const isCaseRow = (n.productsize ?? "").trim() === "0";
      const cashCasePrice = isCaseRow
        ? parseNum(n.cashunitprice || n.cash_unit_price || "")
        : 0;
      const fromDate = parseDate(n.fromdate || n.from_date);
      const toDate = parseDate(n.todate || n.to_date);

      // เดิมรับเฉพาะแถวที่มีราคาเครดิต ทำให้สินค้าที่มีแต่ราคาเงินสด (20 รหัส)
      // ไม่ถูก index เลย — ไม่มีราคาให้ร้านเห็นทั้งที่ต้นทางมี
      if ((cashCasePrice > 0 || creditCasePrice > 0) && fromDate && toDate) {
        const rec: PriceRecord = {
          fromDate,
          toDate,
          cashCasePrice,
          creditCasePrice,
          isCaseRow,
        };
        const bucket = pricesByCode.get(productCode) ?? [];
        bucket.push(rec);
        pricesByCode.set(productCode, bucket);
      }
    });

    this.loadedCount = count;
    this.nameByCode = nameByCode;
    this.metaByCode = metaByCode;
    this.pricesByCode = pricesByCode;
    this.csvPath = csvPath;

    console.info(
      `[SkuMaster] Loaded ${count} rows, ${pricesByCode.size} priced SKUs from ${csvPath}`
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }
}

export function reloadSkuMaster(csvPath: string): void {
  const dir = new SkuMasterDirectory();
  dir.load(csvPath);
}
