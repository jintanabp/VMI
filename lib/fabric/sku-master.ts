import fs from "fs";
import { readCsvFile } from "./csv";

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
}

function normKeys(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = (v ?? "").trim();
  }
  return out;
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
  private rows: SkuMasterRow[] = [];
  private nameByCode = new Map<string, string>();
  private pricesByCode = new Map<string, PriceRecord[]>();
  private csvPath: string | null = null;

  get isLoaded() {
    return this.rows.length > 0;
  }

  nameForSku(code: string): string {
    return this.nameByCode.get(code.trim()) ?? "";
  }

  getLookupPrice(
    productCode: string,
    on: Date = new Date()
  ): { price: number | null; expired: boolean } {
    const code = productCode.trim();
    const candidates = this.pricesByCode.get(code) ?? [];
    if (candidates.length === 0) return { price: null, expired: false };

    const active = candidates.filter((r) => r.fromDate <= on && on <= r.toDate);
    if (active.length > 0) {
      const best = active.reduce((a, b) =>
        a.fromDate > b.fromDate ? a : b
      );
      return { price: best.creditPrice, expired: false };
    }

    const expired = candidates.filter((r) => r.toDate < on);
    if (expired.length > 0) {
      const best = expired.reduce((a, b) => (a.toDate > b.toDate ? a : b));
      return { price: best.creditPrice, expired: true };
    }

    return { price: null, expired: false };
  }

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[SkuMaster] CSV not found: ${csvPath}`);
      this.rows = [];
      this.csvPath = csvPath;
      return;
    }

    const { rows } = readCsvFile(csvPath);
    const parsedRows: SkuMasterRow[] = [];
    const nameByCode = new Map<string, string>();
    const pricesByCode = new Map<string, PriceRecord[]>();

    for (const row of rows) {
      const n = normKeys(row);
      const productCode =
        n.productcode || n.sku || n.product_code || n.item_code || "";
      if (!productCode) continue;

      const barcode = n.barcode || n.ean || "";
      const name =
        n.name ||
        n.product_name ||
        splitCodeName(n.productcode_name || "") ||
        productCode;

      parsedRows.push({ productCode, barcode, name });
      if (!nameByCode.has(productCode)) {
        nameByCode.set(productCode, name);
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
    }

    this.rows = parsedRows;
    this.nameByCode = nameByCode;
    this.pricesByCode = pricesByCode;
    this.csvPath = csvPath;

    console.info(
      `[SkuMaster] Loaded ${parsedRows.length} rows, ${pricesByCode.size} priced SKUs from ${csvPath}`
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
