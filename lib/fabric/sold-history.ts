import fs from "fs";
import { readCsvFile } from "./csv";

export interface DailySale {
  /** วันที่ในรูปแบบ YYYY-MM-DD */
  date: string;
  qty: number;
}

export interface SoldHistorySummary {
  /** ยอดรายวันเรียงเก่า→ใหม่ เติม 0 ให้ครบทุกวันในช่วง */
  series: DailySale[];
  /** ยอดรวมในช่วง */
  total: number;
  /** เฉลี่ยต่อวัน (หาร window) */
  avgPerDay: number;
  /** เฉลี่ยต่อสัปดาห์ */
  avgPerWeek: number;
  /** มีข้อมูลย้อนหลังของสินค้านี้หรือไม่ */
  hasData: boolean;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** จำนวนวันย้อนหลังสูงสุดที่เก็บใน memory (bound ขนาดจากไฟล์ 2 ปี) */
const MAX_DAYS_KEPT = 120;

function normKeys(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = (v ?? "").trim();
  }
  return out;
}

function parseNum(raw: string | undefined): number {
  const s = (raw ?? "").replace(/,/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** แปลง source จาก factsales_odoo เช่น "VDA_1-พีเอส..." → "vda1" */
function normalizeStoreKey(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  const vda = s.match(/^vda[_\s-]?(\d+)/);
  if (vda) return `vda${vda[1]}`;
  return s;
}

function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // รองรับ YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, DD/MM/YYYY
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function pick(
  keys: string[],
  candidates: string[]
): string | null {
  for (const c of candidates) {
    if (keys.includes(c)) return c;
  }
  // partial match
  for (const k of keys) {
    if (candidates.some((c) => k.includes(c))) return k;
  }
  return null;
}

/** ประวัติยอดขายรายวัน — index แบบ productCode -> storeKey -> DailySale[]
 *  schema-tolerant: ตรวจชื่อคอลัมน์อัตโนมัติ */
export class SoldHistoryDirectory {
  // productCode -> storeKey -> date -> qty (accumulate)
  private data = new Map<string, Map<string, Map<string, number>>>();
  private csvPath: string | null = null;
  private hasStoreKey = false;
  /** วันที่ล่าสุดที่พบในไฟล์ (ใช้เป็นจุดอ้างอิงช่วงเวลา) */
  private latestDate = "";

  get isLoaded() {
    return this.data.size > 0;
  }

  get lastDate() {
    return this.latestDate;
  }

  private accumulate(
    productCode: string,
    storeKey: string,
    date: string,
    qty: number
  ) {
    let byStore = this.data.get(productCode);
    if (!byStore) {
      byStore = new Map();
      this.data.set(productCode, byStore);
    }
    let byDate = byStore.get(storeKey);
    if (!byDate) {
      byDate = new Map();
      byStore.set(storeKey, byDate);
    }
    byDate.set(date, (byDate.get(date) ?? 0) + qty);
  }

  /** คืนยอดขายรายวัน N วันล่าสุด สำหรับ (store, product) */
  getDaily(
    productCode: string,
    storeKey: string,
    days = 7
  ): DailySale[] {
    const code = productCode.trim();
    const byStore = this.data.get(code);
    if (!byStore) return [];

    const key = storeKey.trim().toLowerCase();
    const byDate =
      byStore.get(key) ??
      // ถ้าไม่มี store key ตรง ใช้ aggregate (key ว่าง) แทน
      byStore.get("");
    if (!byDate) return [];

    const all: DailySale[] = [...byDate.entries()]
      .map(([date, qty]) => ({ date, qty }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return all.slice(0, days);
  }

  /** รวมยอดทุก store ของสินค้า (date -> qty) เมื่อไม่มี storeKey ตรง */
  private aggregateByDate(productCode: string): Map<string, number> | null {
    const byStore = this.data.get(productCode.trim());
    if (!byStore) return null;
    const merged = new Map<string, number>();
    for (const byDate of byStore.values()) {
      for (const [date, qty] of byDate) {
        merged.set(date, (merged.get(date) ?? 0) + qty);
      }
    }
    return merged.size > 0 ? merged : null;
  }

  /** สรุปยอดขาย: series เติม 0 ครบทุกวัน + เฉลี่ยต่อวัน/สัปดาห์
   *  storeKey ที่ไม่ตรงจะ fallback ไปรวมทุก store */
  getSummary(
    productCode: string,
    storeKey: string,
    days = 7
  ): SoldHistorySummary {
    const empty: SoldHistorySummary = {
      series: [],
      total: 0,
      avgPerDay: 0,
      avgPerWeek: 0,
      hasData: false,
    };

    const code = productCode.trim();
    const byStore = this.data.get(code);
    if (!byStore) return empty;

    const key = storeKey.trim().toLowerCase();
    const byDate =
      byStore.get(key) ?? byStore.get("") ?? this.aggregateByDate(code);
    if (!byDate || byDate.size === 0) return empty;

    // จุดสิ้นสุดช่วง: วันล่าสุดในไฟล์ (ไม่ใช่วันนี้ กัน timezone/ข้อมูลล่าช้า)
    const end = this.latestDate || [...byDate.keys()].sort().at(-1) || "";
    if (!end) return empty;

    const series: DailySale[] = [];
    let total = 0;
    for (let i = days - 1; i >= 0; i--) {
      const date = addDays(end, -i);
      const qty = byDate.get(date) ?? 0;
      total += qty;
      series.push({ date, qty });
    }

    const avgPerDay = days > 0 ? total / days : 0;
    return {
      series,
      total,
      avgPerDay,
      avgPerWeek: avgPerDay * 7,
      hasData: true,
    };
  }

  /** สรุปยอดขายเฉพาะชุด storeKey ที่ระบุ (เช่น customercode ของ VDA) — รวมเฉพาะ key เหล่านั้น
   *  ไม่ fallback ไปรวมทุก store (ต่างจาก getSummary) เพื่อกรองรายร้านให้ถูกต้อง */
  getSummaryForKeys(
    productCode: string,
    storeKeys: string[],
    days = 7
  ): SoldHistorySummary {
    const empty: SoldHistorySummary = {
      series: [],
      total: 0,
      avgPerDay: 0,
      avgPerWeek: 0,
      hasData: false,
    };

    const code = productCode.trim();
    const byStore = this.data.get(code);
    if (!byStore) return empty;

    const merged = new Map<string, number>();
    let matched = false;
    for (const raw of storeKeys) {
      const byDate = byStore.get(raw.trim().toLowerCase());
      if (!byDate) continue;
      matched = true;
      for (const [date, qty] of byDate) {
        merged.set(date, (merged.get(date) ?? 0) + qty);
      }
    }
    if (!matched || merged.size === 0) return empty;

    const end = this.latestDate || [...merged.keys()].sort().at(-1) || "";
    if (!end) return empty;

    const series: DailySale[] = [];
    let total = 0;
    for (let i = days - 1; i >= 0; i--) {
      const date = addDays(end, -i);
      const qty = merged.get(date) ?? 0;
      total += qty;
      series.push({ date, qty });
    }
    const avgPerDay = days > 0 ? total / days : 0;
    return {
      series,
      total,
      avgPerDay,
      avgPerWeek: avgPerDay * 7,
      hasData: true,
    };
  }

  load(csvPath: string): void {
    this.data = new Map();
    this.latestDate = "";
    this.csvPath = csvPath;
    if (!fs.existsSync(csvPath)) {
      console.warn(`[SoldHistory] CSV not found: ${csvPath}`);
      return;
    }

    const { headers, rows } = readCsvFile(csvPath);
    if (rows.length === 0) return;

    const keys = headers.map((h) => h.toLowerCase().trim());
    const productKey = pick(keys, [
      "productcode",
      "product_code",
      "sku",
      "item_code",
      "itemcode",
    ]);
    const dateKey = pick(keys, [
      "date_invoice",
      "date",
      "saledate",
      "sale_date",
      "day",
      "docdate",
    ]);
    const qtyKey = pick(keys, [
      "unit_qty",
      "qty",
      "quantity",
      "sold_qty",
      "soldqty",
      "sale_qty",
      "qty_sold",
      "sum_qty",
    ]);
    // factsales_odoo ใช้ source (VDA_N-ชื่อ); cross_sold ใช้ customercode / from_db
    const storeKey = pick(keys, [
      "source",
      "customercode",
      "customer_code",
      "custcode",
      "from_db",
      "storecode",
      "store_code",
      "branch",
      "vda",
    ]);

    if (!productKey || !dateKey || !qtyKey) {
      console.warn(
        `[SoldHistory] ไม่พบคอลัมน์ที่ต้องการ (product/date/qty) — headers: ${headers.join(", ")}`
      );
      return;
    }
    this.hasStoreKey = !!storeKey;

    // ตัดเฉพาะช่วงล่าสุดเพื่อ bound memory
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS_KEPT);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let kept = 0;
    for (const row of rows) {
      const n = normKeys(row);
      const productCode = n[productKey];
      if (!productCode) continue;
      const date = parseDate(n[dateKey]);
      if (!date || date < cutoffStr) continue;
      const qty = parseNum(n[qtyKey]);
      const sKey = storeKey ? normalizeStoreKey(n[storeKey] ?? "") : "";
      this.accumulate(productCode, sKey, date, qty);
      if (date > this.latestDate) this.latestDate = date;
      kept++;
    }

    console.info(
      `[SoldHistory] Loaded ${kept} recent rows for ${this.data.size} products (storeKey=${this.hasStoreKey}) from ${csvPath}`
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }
}
