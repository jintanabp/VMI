import { sortStockDisplayRows } from "@/lib/promo/promo-group-display";

export type StockSortKey = "code" | "brand" | "section" | "promoGroup";
export type StockSortDir = "asc" | "desc";

export interface StockSortState {
  key: StockSortKey;
  dir: StockSortDir;
}

/** ค่าเริ่มต้น: รหัสสินค้ามากไปน้อย */
export const DEFAULT_STOCK_SORT: StockSortState = { key: "code", dir: "desc" };

export const STOCK_SORT_OPTIONS: { key: StockSortKey; label: string }[] = [
  { key: "code", label: "รหัสสินค้า" },
  { key: "brand", label: "แบรนด์" },
  { key: "section", label: "กลุ่มสินค้า" },
  { key: "promoGroup", label: "กลุ่มโปรโมชั่น" },
];

interface SortableStockRow {
  skuCode: string;
  brand?: string;
  section?: string;
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
  return [...rows].sort((a, b) => {
    if (key === "code") {
      return sign * compareCode(a.skuCode, b.skuCode);
    }
    const av = key === "brand" ? (a.brand ?? "") : (a.section ?? "");
    const bv = key === "brand" ? (b.brand ?? "") : (b.section ?? "");
    const cmp = compareText(av, bv);
    if (cmp !== 0) return sign * cmp;
    // ภายในแบรนด์/กลุ่มเดียวกัน เรียงรหัสตามทิศทางเดียวกันเสมอ
    return sign * compareCode(a.skuCode, b.skuCode);
  });
}
