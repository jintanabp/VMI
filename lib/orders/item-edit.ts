/**
 * กติกาเล็ก ๆ ของการแก้ราคา/จำนวนรายบรรทัดฝั่งเซลล์ (PATCH /api/orders) — ฟังก์ชันล้วน ทดสอบได้
 */

/** ข้อความเมื่อราคาไม่ผ่าน — ใช้ร่วมกันทั้ง route และเทสต์ */
export const INVALID_SALES_PRICE_ERROR =
  "ราคาต้องมากกว่า 0 บาท — ถ้าจะให้เป็นของแถมให้ใช้โปร ไม่ใช่ตั้งราคา 0";

/**
 * ราคาที่เซลล์ตั้งได้ — null = ยกเลิกราคาที่ตั้งไว้ (กลับไปใช้ราคาระบบ) ผ่านเสมอ
 *
 * ราคา 0 เคยผ่าน (QA 28 ก.ย. 69) แล้วไหลไปถึง payload ERP เป็นบรรทัดซื้อราคา 0
 * ซึ่ง ERP ไม่รู้ว่าเป็นของแถม — กันตั้งแต่ตอนตั้งราคา
 */
export function isValidSalesPrice(v: number | null): boolean {
  if (v == null) return true;
  return Number.isFinite(v) && v > 0;
}

/** เทียบระดับสตางค์ — evaluatePriceOverride ปัดเป็น 2 ตำแหน่งก่อนเก็บ */
function sameBaht(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * ราคาที่ร้านเห็นเปลี่ยนจริงหรือไม่ — false = ไม่ต้องแจ้งร้าน (กันแจ้ง "140 → 140")
 *
 * เทียบ "ราคาที่มีผล" ก่อน/หลัง ไม่ใช่ช่อง override: ตั้งราคาเท่า C4 บนบรรทัดที่ไม่เคยมี override
 * ข้อมูลในฐานเปลี่ยน แต่ร้านเห็นราคาเดิม จึงไม่ใช่เรื่องที่ต้องแจ้ง
 */
export function salesPriceChanged(
  before: {
    salesPriceOverride: number | null;
    unitPriceOverride: number | null;
    c4UnitPrice: number | null;
  },
  nextOverride: number | null
): boolean {
  const prev =
    before.salesPriceOverride ?? before.unitPriceOverride ?? before.c4UnitPrice;
  const next = nextOverride ?? before.unitPriceOverride ?? before.c4UnitPrice;
  return !sameBaht(prev, next);
}

/** จำนวนเปลี่ยนจริงหรือไม่ — false = ไม่ต้องแจ้งร้าน (กันแจ้ง "150 → 150") */
export function qtyChanged(beforeQty: number | null | undefined, nextQty: number): boolean {
  // หาค่าเดิมไม่เจอ = ไม่รู้ว่าเปลี่ยนไหม แจ้งไว้ก่อน (ซ้ำดีกว่าเงียบ)
  if (beforeQty == null) return true;
  return beforeQty !== nextQty;
}
