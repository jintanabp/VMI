import { describe, expect, it } from "vitest";
import { collectOwedFreeGoods } from "@/lib/promo/order-free-goods";

/**
 * ของแถมโปรกลุ่ม — โปรแบบรวมยอดข้าม SKU จะคืน freeGood ก้อนเดียวกัน
 * ติดมาทุกบรรทัดของกลุ่ม ถ้าบวกตรง ๆ ของแถมจะคูณตามจำนวนสมาชิก
 * (เคสจริง: กลุ่ม BSWM ร้าน vda2 สต็อก 5 SKU → บวกดิบได้ 3,000 ทั้งที่ควรได้ 600)
 */
const fg = (code: string, qty: number) => ({
  code,
  name: `ของแถม ${code}`,
  qty,
  unit: "ชิ้น",
});

describe("collectOwedFreeGoods", () => {
  it("โปรกลุ่มหลายสมาชิก → นับของแถมครั้งเดียว", () => {
    const lines = ["A1", "A2", "A3", "A4"].map((skuCode) => ({
      skuCode,
      promoGroup: "GRP1",
      promoGroupMembers: 4,
      freeGood: fg("FREE1", 5),
    }));
    const owed = collectOwedFreeGoods(lines);
    expect(owed).toHaveLength(1);
    expect(owed[0].qty).toBe(5);
    expect(owed[0].fromSkuCodes).toEqual(["A1", "A2", "A3", "A4"]);
  });

  it("โปรราย SKU → บวกทุกบรรทัด เพราะแต่ละบรรทัดได้ของตัวเอง", () => {
    const owed = collectOwedFreeGoods([
      { skuCode: "B1", promoGroup: null, promoGroupMembers: null, freeGood: fg("F", 2) },
      { skuCode: "B2", promoGroup: null, promoGroupMembers: null, freeGood: fg("F", 3) },
    ]);
    expect(owed.map((o) => o.qty)).toEqual([2, 3]);
  });

  it("กลุ่มที่มีสมาชิกเดียว ไม่ถือเป็นโปรกลุ่ม", () => {
    const owed = collectOwedFreeGoods([
      { skuCode: "C1", promoGroup: "G", promoGroupMembers: 1, freeGood: fg("F", 7) },
    ]);
    expect(owed[0].qty).toBe(7);
    expect(owed[0].promoGroup).toBeNull();
  });

  it("หลายกลุ่มปนกัน → นับกลุ่มละครั้ง", () => {
    const owed = collectOwedFreeGoods([
      { skuCode: "D1", promoGroup: "G1", promoGroupMembers: 2, freeGood: fg("F1", 4) },
      { skuCode: "D2", promoGroup: "G1", promoGroupMembers: 2, freeGood: fg("F1", 4) },
      { skuCode: "D3", promoGroup: "G2", promoGroupMembers: 3, freeGood: fg("F2", 9) },
      { skuCode: "D4", promoGroup: "G2", promoGroupMembers: 3, freeGood: fg("F2", 9) },
      { skuCode: "D5", promoGroup: null, promoGroupMembers: null, freeGood: null },
    ]);
    expect(owed.map((o) => `${o.code}:${o.qty}`)).toEqual(["F1:4", "F2:9"]);
  });

  it("กลุ่มเดียวกันแต่ของแถมคนละรหัส → ห้ามยุบรวม", () => {
    const owed = collectOwedFreeGoods([
      { skuCode: "E1", promoGroup: "G", promoGroupMembers: 2, freeGood: fg("F3", 1) },
      { skuCode: "E2", promoGroup: "G", promoGroupMembers: 2, freeGood: fg("F4", 2) },
    ]);
    expect(owed.map((o) => o.code)).toEqual(["F3", "F4"]);
  });

  it("ไม่มีของแถม หรือจำนวน 0 → ข้าม", () => {
    const owed = collectOwedFreeGoods([
      { skuCode: "X1", promoGroup: null, promoGroupMembers: null, freeGood: fg("F", 0) },
      { skuCode: "X2", promoGroup: null, promoGroupMembers: null, freeGood: null },
    ]);
    expect(owed).toEqual([]);
  });

  it("ข้อมูลเพี้ยน จำนวนไม่เท่ากันในกลุ่ม → ยึดค่ามากสุด (แถมขาดแย่กว่าแถมเกิน)", () => {
    const owed = collectOwedFreeGoods([
      { skuCode: "Y1", promoGroup: "G", promoGroupMembers: 2, freeGood: fg("F", 3) },
      { skuCode: "Y2", promoGroup: "G", promoGroupMembers: 2, freeGood: fg("F", 8) },
    ]);
    expect(owed[0].qty).toBe(8);
  });

  /**
   * พนักงานตัดจำนวนเหลือ 0 ก่อนอนุมัติ = ตั้งใจไม่สั่งบรรทัดนั้น
   * เดิมของแถมยังตามไปทั้งในเอกสาร PO และหน้าประวัติร้าน
   */
  describe("บรรทัดที่ถูกตัดเหลือจำนวน 0", () => {
    it("โปรราย SKU สั่ง 0 → ไม่ได้ของแถม", () => {
      const owed = collectOwedFreeGoods([
        { skuCode: "Z1", qty: 0, promoGroup: null, promoGroupMembers: null, freeGood: fg("F", 5) },
        { skuCode: "Z2", qty: 3, promoGroup: null, promoGroupMembers: null, freeGood: fg("F", 5) },
      ]);
      expect(owed).toHaveLength(1);
      expect(owed[0].fromSkuCodes).toEqual(["Z2"]);
    });

    it("โปรกลุ่ม: สมาชิกตัวหนึ่งถูกตัดเหลือ 0 → กลุ่มยังได้ของแถมก้อนเดิมครั้งเดียว", () => {
      // ของแถมเป็นของ "กลุ่ม" — สมาชิกที่เหลือยังซื้อครบขั้น กลุ่มจึงยังได้ของแถม
      const owed = collectOwedFreeGoods([
        { skuCode: "G1", qty: 0, promoGroup: "GRP", promoGroupMembers: 3, freeGood: fg("F", 600) },
        { skuCode: "G2", qty: 20, promoGroup: "GRP", promoGroupMembers: 3, freeGood: fg("F", 600) },
        { skuCode: "G3", qty: 20, promoGroup: "GRP", promoGroupMembers: 3, freeGood: fg("F", 600) },
      ]);
      expect(owed).toHaveLength(1);
      expect(owed[0].qty).toBe(600);
    });

    it("ไม่ส่ง qty มาเลย → ทำงานเหมือนเดิม (ผู้เรียกเก่าไม่พัง)", () => {
      const owed = collectOwedFreeGoods([
        { skuCode: "N1", promoGroup: null, promoGroupMembers: null, freeGood: fg("F", 2) },
      ]);
      expect(owed).toHaveLength(1);
      expect(owed[0].qty).toBe(2);
    });
  });
});
