/**
 * ตัวกรองหน้าสต็อก — แยกออกมาเป็น pure function เพื่อให้หน้าเว็บกับไฟล์ Excel
 * ที่ส่งออกใช้ตรรกะเดียวกันเป๊ะ (ไฟล์ต้องตรงกับสิ่งที่ผู้ใช้เห็นบนจอ)
 *
 * แบ่งเป็น 2 ชั้น เพื่อไม่ให้ผู้ใช้ต้องเดาว่าปุ่มไหนทับปุ่มไหน:
 *   1. `view`  — มุมมองหลัก เลือกได้ทีละอัน (ทั้งหมด / ควรสั่ง / วิกฤต / ใหม่ / ไม่ขาย / ค้างสต็อก)
 *   2. ตัวกรองย่อย — แบรนด์ · กลุ่มสินค้า · ซ่อนสินค้าไม่ขาย ใช้ร่วมกับมุมมองใดก็ได้
 */

export type StockView =
  | "all"
  | "needs"
  | "critical"
  | "new"
  | "noSales"
  | "deadStock"
  | "target";

export interface StockFilterState {
  view: StockView;
  brand: string | null;
  section: string | null;
  /** ซ่อนสินค้าที่ไม่มียอดขายใน 1 เดือน (ไม่มีผลเมื่อ view = "noSales") */
  hideNoSales: boolean;
}

export const DEFAULT_STOCK_FILTERS: StockFilterState = {
  view: "all",
  brand: null,
  section: null,
  hideNoSales: false,
};

interface FilterableStockRow {
  brand?: string;
  section?: string;
  needsOrder?: boolean;
  isNew?: boolean;
  noSales30?: boolean;
  stockCvd?: number | null;
  minDays?: number;
  avgSales?: number;
  /** คงเหลือหน่วยหีบ (ทศนิยมได้) */
  stock?: number;
  /** มาจากเป้าขายเดือนนี้ ไม่ได้อยู่ในคลัง — เห็นเฉพาะมุมมอง "ควรมีขาย" */
  fromTarget?: boolean;
  /** มีโปร C4 อยู่ แต่ร้านไม่เคยสต็อก — เห็นเฉพาะมุมมอง "ควรมีขาย" เหมือนกัน */
  fromPromo?: boolean;
}

/** สต็อกวิกฤต: จะหมดก่อนถึงจำนวนวันขั้นต่ำ (CVD < MIN) ทั้งที่ยังมีการขาย → เสี่ยงขาดสต็อก
 *  (stockCvd เป็น null อยู่แล้วเมื่อ avgSales = 0 จึงถือว่า "มีการขาย" โดยปริยาย) */
export function isCriticalStock(r: FilterableStockRow): boolean {
  return (
    r.stockCvd != null &&
    (r.avgSales ?? 0) > 0 &&
    r.stockCvd < (r.minDays ?? 0)
  );
}

/**
 * ค้างสต็อก: ไม่มียอดขายเลยใน 30 วัน แต่ของยังค้างอยู่ในคลัง
 *
 * ต่างจากมุมมอง "ไม่ขาย 1 เดือน" ที่รวมของที่ขายหมดไปแล้วด้วย — เคสนั้นแค่หยุดสั่งพอ
 * แต่เคสนี้คือเงินจมอยู่จริง ต้องเร่งระบายหรือคืนของ ไม่ใช่แค่หยุดสั่ง
 */
export function isDeadStock(r: FilterableStockRow): boolean {
  return Boolean(r.noSales30) && (r.stock ?? 0) > 0;
}

/** ผ่านมุมมองหลักหรือไม่ */
function matchesView(row: FilterableStockRow, view: StockView): boolean {
  switch (view) {
    case "needs":
      return Boolean(row.needsOrder);
    case "critical":
      return isCriticalStock(row);
    case "new":
      return Boolean(row.isNew);
    case "noSales":
      return Boolean(row.noSales30);
    case "deadStock":
      return isDeadStock(row);
    case "target":
      return true;
    default:
      return true;
  }
}

export function filterStockRows<T extends FilterableStockRow>(
  rows: T[],
  filters: StockFilterState
): T[] {
  const { view, brand, section, hideNoSales } = filters;
  // มุมมองที่ "ไม่ขาย" เป็นเงื่อนไขของตัวเองอยู่แล้ว การซ่อนย่อมขัดกันเอง
  // (ไม่กันไว้ = เปิดแท็บค้างสต็อกทั้งที่เปิดปุ่มซ่อนไว้ แล้วได้ตารางว่างโดยไม่รู้สาเหตุ)
  const hide = hideNoSales && view !== "noSales" && view !== "deadStock";

  return rows.filter((r) => {
    // ของที่ร้านยังไม่มีในคลัง (เป้าขาย / มีโปร) คงเหลือกับยอดขายเป็น 0 ทั้งแถว
    // ปล่อยปนกับแถวปกติจะไปโผล่ใน "ไม่ขาย 1 เดือน" และทำตัวเลขทุกแท็บเพี้ยน
    const notStocked = Boolean(r.fromTarget) || Boolean(r.fromPromo);
    if (notStocked !== (view === "target")) return false;
    if (!matchesView(r, view)) return false;
    if (hide && r.noSales30) return false;
    if (brand && (r.brand ?? "") !== brand) return false;
    if (section && (r.section ?? "") !== section) return false;
    return true;
  });
}

/** จำนวนตัวกรองที่อยู่ในเมนู "กรอง" เท่านั้น
 *  — มุมมองหลักและปุ่มซ่อนสินค้าไม่ขายมีปุ่มของตัวเองบนทูลบาร์อยู่แล้ว */
export function countActiveFilters(filters: StockFilterState): number {
  let n = 0;
  if (filters.brand) n++;
  if (filters.section) n++;
  return n;
}

export function hasAnyStockFilter(filters: StockFilterState): boolean {
  return filters.view !== "all" || countActiveFilters(filters) > 0;
}

export function isStockView(value: unknown): value is StockView {
  return (
    value === "all" ||
    value === "needs" ||
    value === "critical" ||
    value === "new" ||
    value === "noSales" ||
    value === "deadStock" ||
    value === "target"
  );
}
