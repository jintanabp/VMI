import fs from "fs";
import { streamCsvFile } from "./csv";
import { bangkokDateStr, isoDateStr } from "./bkk-date";

export interface PriceRecord {
  fromDate: Date;
  toDate: Date;
  creditPrice: number;
  cashPrice: number;
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

  getLookupPrice(
    productCode: string,
    on: Date = new Date()
  ): { price: number | null; expired: boolean } {
    const code = productCode.trim();
    const candidates = this.pricesByCode.get(code) ?? [];
    if (candidates.length === 0) return { price: null, expired: false };

    // เทียบเป็นวันที่โซนไทย (inclusive) กัน off-by-one/เลื่อน 7 ชม. ให้ตรงกับ promoActiveOn
    const onStr = bangkokDateStr(on);
    const active = candidates.filter(
      (r) => isoDateStr(r.fromDate) <= onStr && onStr <= isoDateStr(r.toDate)
    );
    if (active.length > 0) {
      const best = active.reduce((a, b) =>
        a.fromDate > b.fromDate ? a : b
      );
      return { price: best.creditPrice, expired: false };
    }

    const expired = candidates.filter((r) => isoDateStr(r.toDate) < onStr);
    if (expired.length > 0) {
      const best = expired.reduce((a, b) => (a.toDate > b.toDate ? a : b));
      return { price: best.creditPrice, expired: true };
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

      count++;
      if (!nameByCode.has(productCode)) {
        nameByCode.set(productCode, name);
      }
      if (!metaByCode.has(productCode)) {
        metaByCode.set(productCode, { barcode, section, brand });
      }

      const creditCol =
        n.creditprice ||
        n.credit_price ||
        n.creditunitprice ||
        n.credit_unit_price ||
        n.price ||
        "";
      const creditPrice = parseNum(creditCol);
      const fromDate = parseDate(n.fromdate || n.from_date);
      const toDate = parseDate(n.todate || n.to_date);

      if (creditPrice > 0 && fromDate && toDate) {
        const rec: PriceRecord = {
          fromDate,
          toDate,
          creditPrice,
          cashPrice: parseNum(n.cashunitprice || n.cash_unit_price),
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
