/**
 * โหมดการดูหน้าสต็อก — "รายการ" (ตารางเดิม) หรือ "โปรโมชั่น" (จัดกลุ่มตามโปร)
 *
 * ไม่เก็บใน StockFilterState เพราะนั่นเป็นสัญญาระหว่าง client กับ /api/stock/export
 * ที่ประกอบกลับจาก query param — โหมดแสดงผลไม่ใช่เงื่อนไขกรองแถว
 */
export type StockBrowseMode = "list" | "promo";

export const DEFAULT_STOCK_BROWSE_MODE: StockBrowseMode = "list";
export const BROWSE_MODE_STORAGE_KEY = "vmi_stock_mode";

export function isStockBrowseMode(v: unknown): v is StockBrowseMode {
  return v === "list" || v === "promo";
}
