import { sortStockDisplayRows } from "@/lib/promo/promo-group-display";

export type StockSortKey =
  | "code"
  | "name"
  | "stock"
  | "avgSales"
  | "cvd"
  | "suggest"
  | "brand"
  | "section"
  | "promoGroup";
export type StockSortDir = "asc" | "desc";

export interface StockSortState {
  key: StockSortKey;
  dir: StockSortDir;
}

/** ค่าเริ่มต้น: รหัสสินค้าน้อยไปมาก */
export const DEFAULT_STOCK_SORT: StockSortState = { key: "code", dir: "asc" };

/** กลุ่มไว้ให้เมนูเรียงลำดับแบ่งหัวข้อได้ */
export type StockSortGroup = "สินค้า" | "ตัวเลข" | "จัดกลุ่ม";

export const STOCK_SORT_OPTIONS: {
  key: StockSortKey;
  label: string;
  group: StockSortGroup;
  /** คำอธิบายทิศทาง asc / desc สำหรับ tooltip และเมนู */
  asc: string;
  desc: string;
}[] = [
  { key: "code", label: "รหัสสินค้า", group: "สินค้า", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  { key: "name", label: "ชื่อสินค้า", group: "สินค้า", asc: "ก → ฮ", desc: "ฮ → ก" },
  { key: "stock", label: "คงเหลือ", group: "ตัวเลข", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  { key: "avgSales", label: "ขายเฉลี่ย/วัน", group: "ตัวเลข", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  { key: "cvd", label: "CVD (วันที่พอขาย)", group: "ตัวเลข", asc: "ใกล้หมดก่อน", desc: "เหลือเยอะก่อน" },
  { key: "suggest", label: "จำนวนแนะนำสั่ง", group: "ตัวเลข", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  { key: "brand", label: "แบรนด์", group: "จัดกลุ่ม", asc: "ก → ฮ", desc: "ฮ → ก" },
  { key: "section", label: "กลุ่มสินค้า", group: "จัดกลุ่ม", asc: "ก → ฮ", desc: "ฮ → ก" },
  { key: "promoGroup", label: "กลุ่มโปรโมชั่น", group: "จัดกลุ่ม", asc: "กลุ่มโปรขึ้นก่อน", desc: "กลุ่มโปรขึ้นก่อน" },
];

export const STOCK_SORT_KEYS: StockSortKey[] = STOCK_SORT_OPTIONS.map(
  (o) => o.key
);

export function isStockSortKey(value: unknown): value is StockSortKey {
  return typeof value === "string" && STOCK_SORT_KEYS.includes(value as StockSortKey);
}

interface SortableStockRow {
  skuCode: string;
  skuName?: string;
  brand?: string;
  section?: string;
  stock?: number;
  avgSales?: number;
  avgQtyOutL7?: number;
  stockCvd?: number | null;
  suggestOrder?: number;
  promoGroup?: string | null;
  promoGroupMembers?: number | null;
  needsOrder?: boolean;
  isNew?: boolean;
}

function compareCode(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** ค่าว่างไปท้ายเสมอ ไม่ว่าจะเรียงขึ้นหรือลง */
function compareText(a: string, b: string): number {
  const av = a.trim();
  const bv = b.trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv, "th", { numeric: true });
}

/** ค่าที่ใช้เรียงของคีย์ตัวเลข — null = ไม่มีข้อมูล (ไปท้ายตารางเสมอ) */
function numericValue(
  row: SortableStockRow,
  key: StockSortKey
): number | null {
  const raw =
    key === "stock"
      ? row.stock
      : key === "avgSales"
        ? (row.avgQtyOutL7 ?? row.avgSales)
        : key === "cvd"
          ? row.stockCvd
          : row.suggestOrder;
  if (raw == null || Number.isNaN(raw)) return null;
  return raw;
}

const NUMERIC_KEYS: StockSortKey[] = ["stock", "avgSales", "cvd", "suggest"];

/** คีย์ที่ลำดับตายตัว — ปุ่มสลับขึ้น/ลงไม่มีผล */
export function isFixedOrderSort(key: StockSortKey): boolean {
  return key === "promoGroup";
}

/**
 * เรียงแถวสต็อกตามคีย์ที่ผู้ใช้เลือก
 *
 * `promoGroup` ใช้ตรรกะเดิม (sortStockDisplayRows) ที่จับแถวกลุ่มโปรให้ติดกันและ
 * ดันกลุ่มขึ้นบนสุด เพื่อให้แถบสี/แถวหัวกลุ่มทำงานได้ — ลำดับตายตัว ไม่กลับด้าน
 * (กลับด้านแล้วกลุ่มโปรจะตกไปท้ายตาราง ซึ่งขัดกับจุดประสงค์ของการเรียงแบบนี้)
 * คีย์อื่นเรียงตรง ๆ แล้วปิดแถบสีแทน
 *
 * แถวที่ไม่มีค่า (เช่น CVD = null เพราะไม่มียอดขาย) ถูกดันไปท้ายตารางเสมอ
 * ไม่ว่าจะเรียงขึ้นหรือลง — กันไม่ให้ของที่ "ไม่มีข้อมูล" มาบังของที่ต้องรีบดู
 */
export function sortStockRows<T extends SortableStockRow>(
  rows: T[],
  key: StockSortKey,
  dir: StockSortDir
): T[] {
  if (key === "promoGroup") {
    return sortStockDisplayRows(rows);
  }

  const sign = dir === "desc" ? -1 : 1;
  const numeric = NUMERIC_KEYS.includes(key);

  return [...rows].sort((a, b) => {
    if (key === "code") {
      return sign * compareCode(a.skuCode, b.skuCode);
    }

    if (numeric) {
      const av = numericValue(a, key);
      const bv = numericValue(b, key);
      if (av === null || bv === null) {
        // ไม่มีค่า → ท้ายตารางเสมอ (ไม่คูณ sign)
        if (av !== bv) return av === null ? 1 : -1;
      } else if (av !== bv) {
        return sign * (av - bv);
      }
      return compareCode(a.skuCode, b.skuCode);
    }

    const av =
      key === "brand"
        ? (a.brand ?? "")
        : key === "name"
          ? (a.skuName ?? "")
          : (a.section ?? "");
    const bv =
      key === "brand"
        ? (b.brand ?? "")
        : key === "name"
          ? (b.skuName ?? "")
          : (b.section ?? "");
    const cmp = compareText(av, bv);
    if (cmp !== 0) return sign * cmp;
    // ภายในแบรนด์/กลุ่มเดียวกัน เรียงรหัสตามทิศทางเดียวกันเสมอ
    return sign * compareCode(a.skuCode, b.skuCode);
  });
}
