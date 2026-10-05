import { describe, expect, it } from "vitest";
import { enrichStockRowsWithPooledPromo } from "@/lib/promo/stock-pooled-promo";
import type { StockRowComputed } from "@/lib/repositories/types";

/**
 * "อีกกี่หีบ" ของโปรกลุ่มต้องเท่ากันทุกแถวในกลุ่ม และนับเฉพาะที่กรอกจริง
 *
 * เดิมแถวที่มีค่าแนะนำเอาค่าแนะนำไปรวมยอดกลุ่ม (ขึ้น "อีก 3") ส่วนแถวที่ไม่มีค่าแนะนำ
 * คิดจาก 0 (ขึ้น "อีก 24") ทั้งที่อยู่ในกลุ่ม BSWN เดียวกัน
 */

const tiers = [
  {
    minQty: 24,
    discount: "แถม ×1",
    sortOrder: 24,
    kind: "premium" as const,
    premiumProduct: "P1",
    premiumQty: 1,
  },
];

function row(skuCode: string, suggestOrder: number): StockRowComputed {
  return {
    skuId: skuCode,
    skuCode,
    suggestOrder,
    unitPrice: 540,
    stock: 0,
    avgSales: 0,
    promoGroup: "BSWN",
    promoGroupMembers: 3,
    promoTiers: tiers,
  } as unknown as StockRowComputed;
}

const rows = [row("A", 6), row("B", 0), row("C", 3)];

describe("enrichStockRowsWithPooledPromo", () => {
  it("ค่าแนะนำที่ยังไม่กดไม่นับ — ทุกแถวขึ้นอีก 24 เท่ากัน", () => {
    const out = enrichStockRowsWithPooledPromo(rows, {});
    expect(out.map((r) => r.qtyToNext)).toEqual([24, 24, 24]);
  });

  it("กรอกแถวเดียว — แถวที่ยังเป็น 0 ก็ใช้ยอดกลุ่มเดียวกัน", () => {
    const out = enrichStockRowsWithPooledPromo(rows, { A: 6 });
    expect(out.map((r) => r.qtyToNext)).toEqual([18, 18, 18]);
  });

  it("ถึงขั้นแล้ว — แถวที่สั่ง 0 ไม่ได้ของแถมไปด้วย", () => {
    const out = enrichStockRowsWithPooledPromo(rows, { A: 20, C: 4 });
    expect(out[0].freeGood?.qty).toBe(1);
    expect(out[1].freeGood).toBeNull();
    expect(out[1].currentPromo).toBeNull();
  });
});
