/**
 * ตรรกะแสดงผลหน้า /history ของร้าน (pure — ใช้ทั้ง API และหน้าจอ และเทสต์ได้โดยไม่ต้องมี DB)
 *
 * แยกออกมาเพราะเดิมหน้าประวัติ "ซ่อน" สิ่งที่พนักงานทำ:
 *   - บรรทัดที่พนักงานปฏิเสธขึ้นเป็นเลข 0 เฉย ๆ ไม่มีเหตุผล ร้านนึกว่าระบบบั๊ก
 *   - ไฮไลต์ "ถูกแก้" เทียบกับจำนวนที่ระบบแนะนำ ร้านสั่งเองต่างจากที่แนะนำก็ขึ้นสีส้ม
 *     ทั้งที่พนักงานไม่ได้แตะเลย
 *   - ยอดรวมบนสุดนับออเดอร์ที่ถูกปฏิเสธไปด้วย ตัวเลขเลยสูงกว่าของที่จะมาจริง
 */

export interface HistoryLineLike {
  finalQty: number;
  suggestedQty: number;
  /** null = แถวเก่าก่อนมีคอลัมน์ requestedQty */
  requestedQty: number | null;
  rejected: boolean;
}

/**
 * จำนวนที่ร้านสั่งเองตอนส่ง — ฐานสำหรับบอกว่าพนักงานแก้หรือเปล่า
 * แถวเก่าไม่มี requestedQty จึงถอยไปใช้ suggestedQty (ดีที่สุดที่มี)
 */
export function storeOrderedQty(line: HistoryLineLike): number {
  return line.requestedQty ?? line.suggestedQty;
}

/** true = จำนวนสุดท้ายต่างจากที่ร้านสั่ง (พนักงานแก้) — บรรทัดที่ถูกปฏิเสธแสดงแยกต่างหาก */
export function lineChangedByStaff(line: HistoryLineLike): boolean {
  if (line.rejected) return false;
  return line.finalQty !== storeOrderedQty(line);
}

export interface HistoryOrderLike {
  status: string;
  totalQty: number;
  orderTotal: number | null;
}

export interface HistoryStats {
  count: number;
  totalQty: number;
  pending: number;
  approved: number;
  totalValue: number | null;
}

/**
 * สรุปตัวเลขบนสุดของหน้า — ออเดอร์ที่ถูกปฏิเสธยังนับใน "จำนวนออเดอร์" (ร้านเห็นการ์ดมันอยู่)
 * แต่ห้ามนับใน «รวมที่สั่ง» / «มูลค่ารวม» เพราะของจะไม่มา
 */
export function summarizeHistory(orders: HistoryOrderLike[]): HistoryStats {
  let totalQty = 0;
  let pending = 0;
  let approved = 0;
  let totalValue = 0;
  let hasValue = false;
  for (const o of orders) {
    if (o.status === "pending_approval") pending++;
    if (o.status === "approved") approved++;
    if (o.status === "rejected") continue;
    totalQty += o.totalQty;
    if (o.orderTotal != null) {
      totalValue += o.orderTotal;
      hasValue = true;
    }
  }
  return {
    count: orders.length,
    totalQty,
    pending,
    approved,
    totalValue: hasValue ? totalValue : null,
  };
}
