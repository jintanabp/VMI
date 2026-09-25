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
  /**
   * สินค้าตัวนี้มี VAT ไหม จากคอลัมน์ VatStatus — `null` = master ไม่บอก
   *
   * ต้องแยก "ไม่มี VAT" (N) ออกจาก "ไม่รู้" (null) ให้ได้ เพราะสองอันนี้ต่างกันตอนออก PO:
   * N คือคิด VAT 0 ได้เลย ส่วน null คือ**ห้ามเดา** — ใบนั้นต้องถูกกันไว้ทั้งใบ
   * (กติกาเดียวกับ ocr-po-matching/backend/erp_export.py ที่ hold ทั้ง PO เมื่อ VAT ไม่รู้)
   *
   * ในไฟล์ปัจจุบัน: Y = 110,457 แถว · N = 125 แถว · ว่าง = 3 แถว
   */
  vatStatus: "Y" | "N" | null;
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

/** "Y"/"N" ตามที่ master เขียนมา — ค่าอื่นและค่าว่างคือ "ไม่รู้" ห้ามเดาเป็น Y */
function parseVatStatus(raw: string | undefined): "Y" | "N" | null {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "Y") return "Y";
  if (s === "N") return "N";
  return null;
}

function parseNum(raw: string | undefined): number {
  const s = (raw ?? "").replace(/,/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export interface SkuSearchHit {
  code: string;
  name: string;
  barcode: string;
  section: string;
  brand: string;
}

/** แถวเบาๆ สำหรับค้นหาเท่านั้น — ไม่เก็บราคา/ประวัติเหมือน pricesByCode เพื่อไม่ให้หน่วยความจำบวม */
interface SkuSearchRow extends SkuSearchHit {
  nameLower: string;
  brandLower: string;
  sectionLower: string;
  barcodeLower: string;
  /** รวมทุกฟิลด์เป็นก้อนเดียวตัวพิมพ์เล็ก — ใช้เป็นทางถอยสุดท้ายเวลาคะแนนอื่นไม่เข้าเงื่อนไข */
  search: string;
}

/** จำนวนสูงสุดที่เก็บไว้จัดอันดับ — เกินกว่านี้แปลว่าคำค้นกว้างเกินจะเลือกอยู่ดี (เท่ากับ CustomerDirectory) */
const SKU_RANK_POOL = 500;

/**
 * คะแนนยิ่งน้อยยิ่งตรง · -1 = ไม่เข้าเงื่อนไข — ลำดับเดียวกับ CustomerDirectory.scoreCustomer:
 * รู้รหัสก็พิมพ์รหัส · รู้บาร์โค้ดก็สแกน/พิมพ์บาร์โค้ด · รู้แค่ชื่อสินค้า/แบรนด์ก็พิมพ์ชื่อ
 */
function scoreSku(r: SkuSearchRow, qLower: string): number {
  const code = r.code.toLowerCase();
  if (code === qLower) return 0;
  if (code.startsWith(qLower)) return 1;

  if (r.barcodeLower && r.barcodeLower === qLower) return 2;
  if (qLower.length >= 4 && r.barcodeLower && r.barcodeLower.includes(qLower)) return 3;

  if (r.nameLower.startsWith(qLower)) return 4;
  if (r.brandLower === qLower) return 5;
  if (r.nameLower.includes(qLower)) return 6;
  if (r.search.includes(qLower)) return 7;

  return -1;
}

export class SkuMasterDirectory {
  private loadedCount = 0;
  private nameByCode = new Map<string, string>();
  private metaByCode = new Map<string, SkuMeta>();
  private pricesByCode = new Map<string, PriceRecord[]>();
  /** เก็บไว้เฉพาะค้นหา (พนักงานเพิ่มสินค้าใหม่เข้าออเดอร์) — ดู searchRanked() */
  private searchRows: SkuSearchRow[] = [];
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
   * มี VAT ไหม — `null` เมื่อ master ไม่บอกหรือไม่รู้จักรหัสนี้
   *
   * ผู้เรียก**ต้องจัดการ null เอง** ห้ามใช้ `?? "Y"` — การเดาว่ามี VAT ทำให้บิลผิด
   * และเป็นเหตุผลที่แยก null ออกจาก "N" ตั้งแต่ชั้นอ่านไฟล์
   */
  vatStatusForSku(code: string): "Y" | "N" | null {
    return this.metaByCode.get(code.trim())?.vatStatus ?? null;
  }

  /**
   * ค้นสินค้าทั้งแคตตาล็อกแบบจัดอันดับ + บอกจำนวนที่เจอทั้งหมด (ดู `scoreSku`)
   *
   * ใช้ตอนพนักงานเพิ่มสินค้าใหม่เข้าออเดอร์ที่ร้านส่งมาแล้ว — ต่างจากช่องค้นหาในหน้า /stock
   * ตรงที่หน้านั้นกรองแค่ในแถวสต็อกที่โหลดมาแล้วของร้านเดียว (ร้านไม่เคยสต็อกจะหาไม่เจอ)
   * ส่วนตัวนี้ค้นทั้ง master ไม่ผูกกับร้านไหนเลย
   */
  searchRanked(
    q: string,
    limit = 20
  ): { hits: SkuSearchHit[]; total: number; capped: boolean } {
    const needle = q.trim();
    if (!needle) return { hits: [], total: 0, capped: false };

    const qLower = needle.toLowerCase();
    const scored: { r: SkuSearchRow; score: number }[] = [];
    let total = 0;

    for (const r of this.searchRows) {
      const score = scoreSku(r, qLower);
      if (score < 0) continue;
      total++;
      if (scored.length < SKU_RANK_POOL) scored.push({ r, score });
    }

    scored.sort(
      (a, b) =>
        a.score - b.score ||
        a.r.code.localeCompare(b.r.code, undefined, { numeric: true })
    );

    return {
      hits: scored.slice(0, limit).map(({ r }) => ({
        code: r.code,
        name: r.name,
        barcode: r.barcode,
        section: r.section,
        brand: r.brand,
      })),
      total,
      capped: total > SKU_RANK_POOL,
    };
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
    const searchRows: SkuSearchRow[] = [];
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
      const vatStatus = parseVatStatus(n.vatstatus || n.vat_status);

      count++;
      if (!nameByCode.has(productCode)) {
        nameByCode.set(productCode, name);
      }
      if (!metaByCode.has(productCode)) {
        metaByCode.set(productCode, {
          barcode,
          section,
          brand,
          packSize,
          vatStatus,
        });
        // เก็บแค่ตอนเจอรหัสนี้ครั้งแรก (เหมือน metaByCode) กันรหัสเดียวซ้ำหลายแถวโผล่ในผลค้นหา
        const nameLower = name.toLowerCase();
        const brandLower = brand.toLowerCase();
        const sectionLower = section.toLowerCase();
        searchRows.push({
          code: productCode,
          name,
          barcode,
          section,
          brand,
          nameLower,
          brandLower,
          sectionLower,
          barcodeLower: barcode.toLowerCase(),
          search: [productCode, nameLower, brandLower, sectionLower, barcode]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        });
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
    this.searchRows = searchRows;
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
