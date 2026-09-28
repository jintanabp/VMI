import { describe, expect, it } from "vitest";
import { isValidSalesPrice, qtyChanged, salesPriceChanged } from "@/lib/orders/item-edit";

describe("isValidSalesPrice (QA 28 ก.ย. 69 — ราคา 0 เคยผ่าน)", () => {
  it("ราคา 0 / ติดลบ / ไม่จำกัด ไม่ผ่าน", () => {
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidSalesPrice(v)).toBe(false);
    }
  });
  it("ราคาบวก และ null (ยกเลิกราคาที่ตั้ง) ผ่าน", () => {
    expect(isValidSalesPrice(0.01)).toBe(true);
    expect(isValidSalesPrice(140)).toBe(true);
    expect(isValidSalesPrice(null)).toBe(true);
  });
});

describe("salesPriceChanged — กันแจ้งร้าน '140 → 140'", () => {
  const base = { salesPriceOverride: null, unitPriceOverride: null, c4UnitPrice: 140 };
  it("ตั้งราคาเท่าที่มีผลอยู่ = ไม่เปลี่ยน", () => {
    expect(salesPriceChanged(base, 140)).toBe(false);
    expect(salesPriceChanged({ ...base, salesPriceOverride: 150 }, 150)).toBe(false);
    // evaluatePriceOverride ปัดเป็นสตางค์ก่อนเก็บ
    expect(salesPriceChanged({ ...base, salesPriceOverride: 150 }, 150.001)).toBe(false);
  });
  it("ยกเลิกราคาที่ไม่เคยตั้ง = ไม่เปลี่ยน · ยกเลิกราคาที่ตั้งไว้ = เปลี่ยน", () => {
    expect(salesPriceChanged(base, null)).toBe(false);
    expect(salesPriceChanged({ ...base, salesPriceOverride: 150 }, null)).toBe(true);
  });
  it("ราคาต่างจริง = เปลี่ยน", () => {
    expect(salesPriceChanged(base, 135)).toBe(true);
    expect(salesPriceChanged({ ...base, c4UnitPrice: null }, 100)).toBe(true);
  });
});

describe("qtyChanged — กันแจ้งร้าน '150 → 150'", () => {
  it("เท่าเดิม = ไม่เปลี่ยน · ต่าง = เปลี่ยน · ไม่รู้ค่าเดิม = ถือว่าเปลี่ยน", () => {
    expect(qtyChanged(150, 150)).toBe(false);
    expect(qtyChanged(150, 140)).toBe(true);
    expect(qtyChanged(null, 140)).toBe(true);
  });
});
