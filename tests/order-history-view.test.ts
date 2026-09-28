import { describe, expect, it } from "vitest";
import {
  lineChangedByStaff,
  storeOrderedQty,
  summarizeHistory,
} from "@/lib/orders/order-history-view";

/**
 * หน้า /history ของร้าน — QA 28 ก.ย. 69: ไฮไลต์ "ถูกแก้" เทียบผิดฐาน และยอดรวมนับออเดอร์ที่ถูกปฏิเสธ
 */

const line = (
  over: Partial<Parameters<typeof lineChangedByStaff>[0]>
): Parameters<typeof lineChangedByStaff>[0] => ({
  finalQty: 5,
  suggestedQty: 5,
  requestedQty: 5,
  rejected: false,
  ...over,
});

describe("lineChangedByStaff", () => {
  it("ร้านสั่งต่างจากที่ระบบแนะนำเอง แต่พนักงานไม่แตะ → ไม่ใช่ 'ถูกแก้'", () => {
    expect(
      lineChangedByStaff(line({ suggestedQty: 2, requestedQty: 5, finalQty: 5 }))
    ).toBe(false);
  });

  it("พนักงานแก้จากที่ร้านสั่ง → ถูกแก้", () => {
    expect(
      lineChangedByStaff(line({ suggestedQty: 5, requestedQty: 5, finalQty: 3 }))
    ).toBe(true);
  });

  it("แถวเก่าไม่มี requestedQty → ถอยไปเทียบ suggestedQty", () => {
    const old = line({ suggestedQty: 4, requestedQty: null, finalQty: 6 });
    expect(storeOrderedQty(old)).toBe(4);
    expect(lineChangedByStaff(old)).toBe(true);
  });

  it("บรรทัดที่ถูกปฏิเสธแสดงเป็น 'ปฏิเสธ' แยก ไม่นับเป็นแก้จำนวน", () => {
    expect(lineChangedByStaff(line({ finalQty: 0, rejected: true }))).toBe(false);
  });
});

describe("summarizeHistory", () => {
  it("ไม่นับออเดอร์ที่ถูกปฏิเสธใน รวมที่สั่ง/มูลค่ารวม แต่ยังนับจำนวนออเดอร์", () => {
    const stats = summarizeHistory([
      { status: "approved", totalQty: 10, orderTotal: 1000 },
      { status: "pending_approval", totalQty: 3, orderTotal: null },
      { status: "rejected", totalQty: 50, orderTotal: 9999 },
    ]);
    expect(stats).toEqual({
      count: 3,
      totalQty: 13,
      pending: 1,
      approved: 1,
      totalValue: 1000,
    });
  });

  it("มีแต่ออเดอร์ที่ถูกปฏิเสธ → มูลค่ารวมเป็น null ไม่ใช่ยอดของที่ไม่มา", () => {
    const stats = summarizeHistory([
      { status: "rejected", totalQty: 5, orderTotal: 500 },
    ]);
    expect(stats.totalQty).toBe(0);
    expect(stats.totalValue).toBeNull();
  });
});
