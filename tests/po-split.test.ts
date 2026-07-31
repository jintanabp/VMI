import { describe, expect, it } from "vitest";
import {
  nextFreeGroupKey,
  proposePoSplit,
  validatePoSplit,
  type SplittableItem,
} from "@/lib/po/split-plan";

/**
 * การแบ่ง PO — กฎที่สำคัญที่สุดคือสินค้าในกลุ่มโปร C4 เดียวกันต้องอยู่ PO เดียวกัน
 * เพราะส่วนลดคิดจากยอดรวมของกลุ่ม ถ้าหักออกจากกันส่วนลดที่คำนวณไว้จะใช้ไม่ได้จริง
 */
function item(over: Partial<SplittableItem> & { id: string }): SplittableItem {
  return {
    skuCode: over.id,
    skuName: `สินค้า ${over.id}`,
    finalQty: 10,
    effectiveUnitPrice: 100,
    ...over,
  };
}

describe("proposePoSplit", () => {
  it("ราคาตรง C4 ทั้งหมด → PO ใบเดียว กลุ่ม A", () => {
    const groups = proposePoSplit([item({ id: "1" }), item({ id: "2" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupKey).toBe("A");
    expect(groups[0].priceKind).toBe("c4");
  });

  it("ราคาไม่ตรง C4 ทั้งหมด → ยังเป็นใบเดียว แต่ประเภทเป็น override", () => {
    const groups = proposePoSplit([
      item({ id: "1", priceFlagged: true }),
      item({ id: "2", priceFlagged: true }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].priceKind).toBe("override");
  });

  it("ราคาผสม → แบ่งเป็น A (ตรง C4) กับ B (ไม่ตรง)", () => {
    const groups = proposePoSplit([
      item({ id: "1" }),
      item({ id: "2", priceFlagged: true }),
    ]);
    expect(groups.map((g) => g.groupKey).sort()).toEqual(["A", "B"]);
  });

  it("ยึดกลุ่มที่พนักงานจัดไว้แล้ว ไม่เสนอใหม่ทับ", () => {
    const groups = proposePoSplit([
      item({ id: "1", poGroup: "A" }),
      item({ id: "2", poGroup: "C" }),
    ]);
    expect(groups.map((g) => g.groupKey).sort()).toEqual(["A", "C"]);
  });

  it("คิดยอดรวมและจำนวนถูกต้อง", () => {
    const groups = proposePoSplit([
      item({ id: "1", finalQty: 3, effectiveUnitPrice: 100 }),
      item({ id: "2", finalQty: 2, effectiveUnitPrice: 50 }),
    ]);
    expect(groups[0].totalQty).toBe(5);
    expect(groups[0].totalAmount).toBe(400);
    expect(groups[0].itemCount).toBe(2);
  });

  it("ออเดอร์ว่าง → ไม่มีกลุ่ม", () => {
    expect(proposePoSplit([])).toEqual([]);
  });
});

describe("validatePoSplit", () => {
  it("ออเดอร์ว่าง → แจ้งว่าไม่มีรายการ", () => {
    expect(validatePoSplit([])).toHaveLength(1);
  });

  it("กลุ่มโปรเดียวกันอยู่ PO เดียวกัน → ผ่าน", () => {
    const errors = validatePoSplit([
      item({ id: "1", promoGroup: "G", promoGroupMembers: 2, poGroup: "A" }),
      item({ id: "2", promoGroup: "G", promoGroupMembers: 2, poGroup: "A" }),
    ]);
    expect(errors).toEqual([]);
  });

  it("กลุ่มโปรเดียวกันถูกแยกคนละ PO → ต้องเตือน", () => {
    const errors = validatePoSplit([
      item({ id: "1", promoGroup: "G", promoGroupMembers: 2, poGroup: "A" }),
      item({ id: "2", promoGroup: "G", promoGroupMembers: 2, poGroup: "B" }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("กลุ่มโปร G");
  });

  it("โปรที่มีสมาชิกเดียว แยก PO ได้ ไม่เตือน", () => {
    const errors = validatePoSplit([
      item({ id: "1", promoGroup: "G", promoGroupMembers: 1, poGroup: "A" }),
      item({ id: "2", promoGroup: "G", promoGroupMembers: 1, poGroup: "B" }),
    ]);
    expect(errors).toEqual([]);
  });

  it("ของแถมหลุดไปคนละ PO กับสินค้าที่ทำให้ได้แถม → ต้องเตือน", () => {
    const errors = validatePoSplit([
      item({ id: "host", skuCode: "host", poGroup: "A" }),
      item({
        id: "gift",
        skuCode: "gift",
        poGroup: "B",
        isFreeGood: true,
        freeGoodPairSku: "host",
      }),
    ]);
    expect(errors.some((e) => e.includes("ของแถม"))).toBe(true);
  });

  it("จัดกลุ่มไม่ครบ → เตือนว่ายังมีรายการค้าง", () => {
    const errors = validatePoSplit([
      item({ id: "1", poGroup: "A" }),
      item({ id: "2" }),
    ]);
    expect(errors.some((e) => e.includes("ยังไม่ได้จัดกลุ่ม"))).toBe(true);
  });
});

describe("nextFreeGroupKey", () => {
  it("ยังไม่มีใครใช้ → ได้ A", () => {
    expect(nextFreeGroupKey([])).toBe("A");
  });

  it("ข้ามคีย์ที่ถูกใช้ไปแล้ว", () => {
    expect(nextFreeGroupKey(["A", "B"])).toBe("C");
  });

  it("มีช่องว่างตรงกลาง → เอาช่องว่างแรก", () => {
    expect(nextFreeGroupKey(["A", "C"])).toBe("B");
  });
});
