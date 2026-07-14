import fs from "fs";
import { readCsvFile } from "./csv";
import { fabricStockEnabled } from "./env";
import { getStockCoverCsvPath } from "./paths";
import {
  getStockFilterConfig,
  type StockFilterConfig,
} from "./stock-filter-config";

const STORE_COLUMN_CANDIDATES = [
  "customercode",
  "customer_code",
  "cuscode",
  "cus_code",
  "storecode",
  "store_code",
  "shopcode",
];

function normKeys(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = (v ?? "").trim();
  }
  return out;
}

function parseNum(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s || s.toUpperCase() === "NULL") return null;
  // ตัด thousands separator ให้ตรงกับ parser ตัวอื่น (กัน "1,234" → NaN → null → stock 0 เงียบ ๆ)
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function rowDateMs(n: Record<string, string>): number {
  const iso = n.date;
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  const y = Number(n.dyear);
  const m = Number(n.dmonth);
  const d = Number(n.dday);
  if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
    return Date.UTC(y, m - 1, d);
  }
  return 0;
}

export interface StockCoverRow {
  productCode: string;
  productName: string;
  fromDb: string;
  storeCode: string;
  dateMs: number;
  qtyAvailable: number;
  avgQtyOutL7: number | null;
  avgQtyOutL30: number | null;
  coverDayL7: number | null;
  coverDayL30: number | null;
}

function parseStockCoverRow(
  row: Record<string, string>,
  storeColumn: string | null
): StockCoverRow | null {
  const n = normKeys(row);
  const productCode = n.productcode;
  if (!productCode) return null;

  const storeCode = storeColumn ? n[storeColumn] ?? "" : "";

  return {
    productCode,
    productName: n.product_name || productCode,
    fromDb: n.from_db || "",
    storeCode,
    dateMs: rowDateMs(n),
    qtyAvailable: parseNum(n.qty_available) ?? 0,
    avgQtyOutL7: parseNum(n.avg_qty_out_l7),
    avgQtyOutL30: parseNum(n.avg_qty_out_l30),
    coverDayL7: parseNum(n.cover_day_l7),
    coverDayL30: parseNum(n.cover_day_l30),
  };
}

function detectStoreColumn(headers: string[]): string | null {
  const envCol = process.env.STOCK_COVER_STORE_COLUMN?.trim().toLowerCase();
  if (envCol) return envCol;

  const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
  for (const c of STORE_COLUMN_CANDIDATES) {
    if (lower.has(c)) return c;
  }
  return null;
}

function latestPerProduct(rows: StockCoverRow[]): StockCoverRow[] {
  const byProduct = new Map<string, StockCoverRow>();
  for (const row of rows) {
    const prev = byProduct.get(row.productCode);
    if (!prev || row.dateMs > prev.dateMs) {
      byProduct.set(row.productCode, row);
    }
  }
  return [...byProduct.values()].sort((a, b) =>
    a.productCode.localeCompare(b.productCode)
  );
}

export class StockCoverDirectory {
  private rows: StockCoverRow[] = [];
  private storeColumn: string | null = null;
  private csvPath: string | null = null;

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[StockCover] CSV not found: ${csvPath}`);
      this.rows = [];
      this.csvPath = csvPath;
      return;
    }

    const { headers, rows } = readCsvFile(csvPath);
    this.storeColumn = detectStoreColumn(headers);

    const parsed: StockCoverRow[] = [];
    for (const row of rows) {
      const item = parseStockCoverRow(row, this.storeColumn);
      if (!item) continue;
      parsed.push(item);
    }

    this.rows = parsed;
    this.csvPath = csvPath;
    console.info(
      `[StockCover] Loaded ${parsed.length} rows from ${csvPath}` +
        (this.storeColumn ? ` (store column: ${this.storeColumn})` : " (no store column — shared catalog)")
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }

  get isLoaded() {
    return this.rows.length > 0;
  }

  get hasStoreColumn() {
    return Boolean(this.storeColumn);
  }

  /** รายการ from_db ที่ใช้ filter บนหน้า stock */
  resolveSources(config: StockFilterConfig = getStockFilterConfig()): string[] {
    let discovered = [
      ...new Set(this.rows.map((r) => r.fromDb).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    if (config.filterMode === "vda" && config.vdaPrefix) {
      const prefix = config.vdaPrefix.toLowerCase();
      discovered = discovered.filter((v) => v.toLowerCase().startsWith(prefix));
    }

    if (config.options.length > 0) {
      if (discovered.length === 0) return config.options;
      return config.options.filter((o) =>
        discovered.some((d) => d.toLowerCase() === o.toLowerCase())
      );
    }

    return discovered;
  }

  /** Rows for a store — latest date per productcode (optional from_db). */
  getForStore(storeCode: string, fromDb?: string | null): StockCoverRow[] {
    const code = storeCode.trim();
    let filtered: StockCoverRow[];

    if (this.storeColumn) {
      filtered = this.rows.filter((r) => r.storeCode === code);
    } else {
      filtered = this.rows;
    }

    if (fromDb?.trim()) {
      const db = fromDb.trim().toLowerCase();
      filtered = filtered.filter((r) => r.fromDb.toLowerCase() === db);
    }

    return latestPerProduct(filtered);
  }
}

let stockCoverDir: StockCoverDirectory | null = null;

function shouldLoadStockCover() {
  if (!fabricStockEnabled()) return false;
  const csvPath = getStockCoverCsvPath();
  return fs.existsSync(csvPath) && fs.statSync(csvPath).size > 100;
}

export function getStockCoverDirectory(): StockCoverDirectory {
  if (!stockCoverDir) {
    stockCoverDir = new StockCoverDirectory();
    if (shouldLoadStockCover()) {
      stockCoverDir.load(getStockCoverCsvPath());
    }
  }
  return stockCoverDir;
}

export function reloadStockCover(): void {
  stockCoverDir = new StockCoverDirectory();
  if (shouldLoadStockCover()) {
    stockCoverDir.load(getStockCoverCsvPath());
  }
}

export function fabricStockReady(): boolean {
  return shouldLoadStockCover() && getStockCoverDirectory().isLoaded;
}
