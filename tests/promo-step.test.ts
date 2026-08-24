import { describe, expect, it } from "vitest";
import type { PromoTierInput } from "@/lib/calculations";
import {
  isOnPromoStep,
  nextPromoStepQty,
  planPromoGroupStepFix,
  prevPromoStepQty,
  promoStepLot,
  promoStepLots,
  snapQtyToPromoStep,
  snapSuggestOrdersToPromoStep,
} from "@/lib/promo/promo-step";

/**
 * ขั้นโปรของแถม — ของแถมนับเป็นล็อต (floor(ยอด / ล็อต)) เศษที่ไม่ครบล็อตไม่ได้อะไร
 * จำนวนสั่งจึงต้องลงล็อตพอดี ไม่งั้นร้านจ่ายเงินซื้อของที่ไม่ได้แถมอะไรเพิ่ม
 */
const premium = (minQty: number, premiumQty = 1): PromoTierInput => ({
  minQty,
  discount: `แถม ×${premiumQty}`,
  sortOrder: minQty,
  kind: "premium",
  premiumProduct: "P1",
  premiumName: "ของแถม",
  premiumQty,
});

const discount = (minQty: number): PromoTierInput => ({
  minQty,
  discount: "50 บาท/หีบ",
  sortOrder: minQty,
  kind: "discount_baht",
  discBaht: 50,
});

/** โปรยอดฮิต "3 หีบแถม 1" */
const buy3 = [premium(3)];
/** บันไดหลายล็อต (190199 ในไฟล์ C4 จริง: 30 แถม 1 / 50 แถม 3 / 100 แถม 7) */
const ladder = [premium(30, 1), premium(50, 3), premium(100, 7)];

describe("promoStepLots", () => {
  it("เอาเฉพาะขั้นของแถม ล็อต 1 ไม่นับเพราะทุกจำนวนลงตัวอยู่แล้ว", () => {
    expect(promoStepLots(buy3)).toEqual([3]);
    expect(promoStepLots(ladder)).toEqual([30, 50, 100]);
    expect(promoStepLots([premium(1)])).toEqual([]);
    expect(promoStepLots([discount(5)])).toEqual([]);
    expect(promoStepLots([])).toEqual([]);
    expect(promoStepLots(undefined)).toEqual([]);
  });

  it("ล็อตที่คุมยอด = ขั้นที่ถึงแล้ว ยังไม่ถึงขั้นแรกใช้ขั้นแรก", () => {
    expect(promoStepLot(ladder, 0)).toBe(30);
    expect(promoStepLot(ladder, 29)).toBe(30);
    expect(promoStepLot(ladder, 60)).toBe(50);
    expect(promoStepLot(ladder, 100)).toBe(100);
    expect(promoStepLot([discount(5)], 10)).toBeNull();
  });
});

describe("snapQtyToPromoStep", () => {
  it("0 = ไม่สั่ง ต้องปล่อยผ่านเสมอ", () => {
    expect(snapQtyToPromoStep(buy3, 0)).toBe(0);
    expect(snapQtyToPromoStep(buy3, -5)).toBe(0);
  });

  it("ต่ำกว่าขั้นแรกดันขึ้นขั้นแรก", () => {
    expect(snapQtyToPromoStep(buy3, 1)).toBe(3);
    expect(snapQtyToPromoStep(buy3, 2)).toBe(3);
  });

  it("เศษไปขั้นที่ใกล้กว่า — สั่ง 5 ในโปร 3 แถม 1 ต้องเป็น 6", () => {
    expect(snapQtyToPromoStep(buy3, 3)).toBe(3);
    expect(snapQtyToPromoStep(buy3, 4)).toBe(3);
    expect(snapQtyToPromoStep(buy3, 5)).toBe(6);
    expect(snapQtyToPromoStep(buy3, 6)).toBe(6);
    expect(snapQtyToPromoStep(buy3, 7)).toBe(6);
    expect(snapQtyToPromoStep(buy3, 8)).toBe(9);
  });

  it("ห่างเท่ากันให้ปัดขึ้น — ของขาดแพงกว่าของเกินนิดเดียว", () => {
    const lot4 = [premium(4)];
    expect(snapQtyToPromoStep(lot4, 6)).toBe(8);
    expect(snapQtyToPromoStep(lot4, 5)).toBe(4);
    expect(snapQtyToPromoStep(lot4, 7)).toBe(8);
  });

  it("ล็อตใหญ่ต้องไม่กระโดดเกือบเท่าตัว — 26 หีบในล็อต 24 ลงที่ 24", () => {
    const lot24 = [premium(24, 6)];
    expect(snapQtyToPromoStep(lot24, 26)).toBe(24);
    expect(snapQtyToPromoStep(lot24, 2)).toBe(24); // ยังไม่ถึงขั้นแรก = ดันขึ้น
    expect(snapQtyToPromoStep(lot24, 40)).toBe(48);
  });

  it("ไม่มีโปรของแถม = ไม่บังคับอะไร", () => {
    expect(snapQtyToPromoStep([discount(5)], 7)).toBe(7);
    expect(snapQtyToPromoStep([premium(1)], 7)).toBe(7);
    expect(snapQtyToPromoStep(undefined, 7)).toBe(7);
  });

  it("บันไดหลายล็อต — เทียบทั้งขั้นล่างและขั้นบน แล้วเลือกที่ใกล้กว่า", () => {
    expect(snapQtyToPromoStep(ladder, 1)).toBe(30);
    expect(snapQtyToPromoStep(ladder, 30)).toBe(30);
    expect(snapQtyToPromoStep(ladder, 31)).toBe(30);
    // 45 ใกล้ 50 มากกว่า 30
    expect(snapQtyToPromoStep(ladder, 45)).toBe(50);
    expect(snapQtyToPromoStep(ladder, 50)).toBe(50);
    expect(snapQtyToPromoStep(ladder, 60)).toBe(50);
    expect(snapQtyToPromoStep(ladder, 100)).toBe(100);
    expect(snapQtyToPromoStep(ladder, 101)).toBe(100);
  });

  it("isOnPromoStep ตรงกับผลของ snap", () => {
    expect(isOnPromoStep(buy3, 6)).toBe(true);
    expect(isOnPromoStep(buy3, 5)).toBe(false);
    expect(isOnPromoStep(buy3, 0)).toBe(true);
  });
});

describe("ปุ่ม +/− เดินทีละขั้น", () => {
  it("บวกไปขั้นถัดไป — ต้องมากกว่าเดิมเสมอ แม้ค่าปัจจุบันจะไม่ลงตัว", () => {
    expect(nextPromoStepQty(buy3, 0)).toBe(3);
    expect(nextPromoStepQty(buy3, 3)).toBe(6);
    expect(nextPromoStepQty(ladder, 30)).toBe(50);
    // 26 ปัดใกล้สุดได้ 24 (ลง) แต่ปุ่ม + ต้องพาขึ้น ไม่ใช่ลด
    expect(nextPromoStepQty([premium(24, 6)], 26)).toBe(48);
  });

  it("ลบลงขั้นก่อนหน้า — ต่ำกว่าขั้นแรกคือเลิกสั่ง", () => {
    expect(prevPromoStepQty(buy3, 6)).toBe(3);
    expect(prevPromoStepQty(buy3, 3)).toBe(0);
    expect(prevPromoStepQty(buy3, 0)).toBe(0);
    // ค่าค้างที่ไม่ลงตัว (มาจากดราฟต์เก่า) ต้องลงมาที่ขั้นที่ลงตัว
    expect(prevPromoStepQty(buy3, 5)).toBe(3);
    expect(prevPromoStepQty(ladder, 100)).toBe(50);
    expect(prevPromoStepQty(ladder, 30)).toBe(0);
    expect(prevPromoStepQty([discount(5)], 7)).toBe(6);
  });
});

describe("planPromoGroupStepFix", () => {
  const lot24 = [premium(24, 6)];

  it("ยอดรวมกลุ่มไม่ลงล็อต → เติมที่ SKU ที่ควรสั่งมากสุด", () => {
    const fix = planPromoGroupStepFix(lot24, [
      { skuCode: "A", qty: 2, suggestOrder: 5 },
      { skuCode: "B", qty: 4, suggestOrder: 8 },
    ]);
    expect(fix).toEqual({
      lot: 24,
      pool: 6,
      target: 24,
      delta: 18,
      topUpSku: "B",
    });
  });

  it("ไม่แอบเพิ่มสินค้าที่ยังไม่ได้สั่งเข้าใบสั่ง", () => {
    const fix = planPromoGroupStepFix(lot24, [
      { skuCode: "A", qty: 2, suggestOrder: 5 },
      { skuCode: "B", qty: 0, suggestOrder: 8 },
    ]);
    expect(fix?.topUpSku).toBe("A");
  });

  it("ไม่ทับบรรทัดที่ผู้ใช้เพิ่งพิมพ์ — ไม่งั้นเลขเด้งกลับจนแก้ไม่ได้", () => {
    const fix = planPromoGroupStepFix(
      lot24,
      [
        { skuCode: "A", qty: 2, suggestOrder: 5 },
        { skuCode: "B", qty: 4, suggestOrder: 8 },
      ],
      { excludeSku: "B" }
    );
    expect(fix?.topUpSku).toBe("A");
  });

  it("มีสมาชิกเดียวก็ต้องเติมที่ตัวเอง", () => {
    const fix = planPromoGroupStepFix(
      lot24,
      [{ skuCode: "A", qty: 5, suggestOrder: 5 }],
      { excludeSku: "A" }
    );
    expect(fix?.topUpSku).toBe("A");
    expect(fix?.target).toBe(24);
  });

  it("ยอดรวมเกินขั้นนิดเดียว → ลดที่บรรทัดที่รับไหว ไม่ใช่ดันขึ้นอีกล็อต", () => {
    const fix = planPromoGroupStepFix(lot24, [
      { skuCode: "A", qty: 20, suggestOrder: 9 },
      { skuCode: "B", qty: 6, suggestOrder: 4 },
    ]);
    expect(fix?.target).toBe(24);
    expect(fix?.delta).toBe(-2);
    expect(fix?.topUpSku).toBe("A");
  });

  it("ไม่มีบรรทัดไหนลดไหว → ถอยไปปัดขึ้นแทน จะได้ไม่ติดลบ", () => {
    const fix = planPromoGroupStepFix(lot24, [
      { skuCode: "A", qty: 1, suggestOrder: 9 },
      { skuCode: "B", qty: 1, suggestOrder: 4 },
      { skuCode: "C", qty: 23, suggestOrder: 0 },
    ]);
    // รวม 25 → ใกล้สุดคือ 24 (ลด 1) และ A ลดไหว
    expect(fix?.target).toBe(24);
    expect(fix?.delta).toBe(-1);
  });

  it("ยอดรวม 0 = เลิกสั่งทั้งกลุ่ม ต้องปล่อยผ่าน", () => {
    expect(
      planPromoGroupStepFix(lot24, [
        { skuCode: "A", qty: 0 },
        { skuCode: "B", qty: 0 },
      ])
    ).toBeNull();
  });

  it("ลงตัวอยู่แล้ว / ไม่มีโปรของแถม → ไม่ต้องปรับ", () => {
    expect(
      planPromoGroupStepFix(lot24, [
        { skuCode: "A", qty: 20 },
        { skuCode: "B", qty: 4 },
      ])
    ).toBeNull();
    expect(
      planPromoGroupStepFix([discount(5)], [{ skuCode: "A", qty: 7 }])
    ).toBeNull();
  });
});

describe("snapSuggestOrdersToPromoStep", () => {
  it("ปัดจำนวนแนะนำรายตัว แต่ไม่ปลุกแถวที่ระบบไม่ได้แนะนำ", () => {
    const out = snapSuggestOrdersToPromoStep([
      { skuCode: "A", suggestOrder: 2, promoTiers: buy3 },
      { skuCode: "B", suggestOrder: 6, promoTiers: buy3 },
      { skuCode: "C", suggestOrder: 0, promoTiers: buy3 },
      { skuCode: "D", suggestOrder: 4, promoTiers: [discount(5)] },
    ]);
    expect(out.get("A")).toBe(3);
    expect(out.has("B")).toBe(false);
    expect(out.has("C")).toBe(false);
    expect(out.has("D")).toBe(false);
  });

  it("โปรกลุ่มคิดที่ยอดรวม แล้วเติมส่วนที่ขาดตัวเดียว ไม่ใช่ปัดทุกบรรทัด", () => {
    const lot24 = [premium(24, 6)];
    const rows = [
      { skuCode: "G1", suggestOrder: 10, promoTiers: lot24, promoGroup: "BSWFN", promoGroupMembers: 3 },
      { skuCode: "G2", suggestOrder: 8, promoTiers: lot24, promoGroup: "BSWFN", promoGroupMembers: 3 },
      { skuCode: "G3", suggestOrder: 2, promoTiers: lot24, promoGroup: "BSWFN", promoGroupMembers: 3 },
    ];
    const out = snapSuggestOrdersToPromoStep(rows);
    expect(out.size).toBe(1);
    expect(out.get("G1")).toBe(14); // รวม 20 → 24 เติม 4 ที่ตัวที่แนะนำมากสุด
  });
});
