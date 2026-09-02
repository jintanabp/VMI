import { describe, expect, it } from "vitest";
import type { PromoTierInput } from "@/lib/calculations";
import {
  isOnPromoStep,
  nextPromoStepQty,
  planPromoGroupStepFix,
  planPromoGroupStepRound,
  planPromoStepRound,
  prevPromoStepQty,
  promoRoundUpRatio,
  promoStepBounds,
  promoStepLot,
  promoStepLots,
  snapQtyToPromoStep,
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

/**
 * ปัดเข้าขั้นโปรตามสัดส่วน — กติกาที่ใช้ในหน้าตรวจโปรก่อนสั่ง
 *
 * ต่างจาก snapQtyToPromoStep ข้างบนตรงที่ "ไม่ดันขึ้นเสมอ": ซื้อมาไม่ถึงสัดส่วนของขั้น
 * ก็ตัดเศษทิ้ง (ยังไม่ซื้อรอบนี้) ล็อตที่ต้องซื้อเกิน 12 หีบถึงจะแถม ต้องถึงครึ่งขั้นก่อน
 */
describe("planPromoStepRound", () => {
  /** โปร 12 แถม 1 — ตัวอย่างที่ใช้ตกลงกติกากันไว้ */
  const buy12 = [premium(12)];
  /** ล็อตใหญ่ (ต้องซื้อเกิน 12 หีบถึงจะแถม) — เกณฑ์ขยับเป็นครึ่งขั้น */
  const buy24 = [premium(24)];

  it("เกณฑ์ปัดขึ้น 30% ปกติ · ล็อตเกิน 12 หีบใช้ 50%", () => {
    expect(promoRoundUpRatio(3)).toBe(0.3);
    expect(promoRoundUpRatio(12)).toBe(0.3);
    expect(promoRoundUpRatio(13)).toBe(0.5);
    expect(promoRoundUpRatio(24)).toBe(0.5);
  });

  it("ขั้นที่ขนาบยอด — ยังไม่ถึงขั้นแรก ขั้นล่างคือ 'ไม่ซื้อ' ไม่ใช่ขั้นแรก", () => {
    expect(promoStepBounds(buy12, 9)).toEqual({ down: 0, up: 12 });
    expect(promoStepBounds(buy12, 13)).toEqual({ down: 12, up: 24 });
    expect(promoStepBounds(buy12, 12)).toEqual({ down: 12, up: 24 });
    expect(promoStepBounds([discount(5)], 9)).toBeNull();
  });

  it("โปร 12 แถม 1 — แนะนำ 9 (75% ของขั้น) ปัดขึ้นเป็น 12", () => {
    const round = planPromoStepRound(buy12, 9);
    expect(round?.applied).toBe(12);
    expect(round?.requested).toBe(9);
    expect(round?.direction).toBe("up");
    expect(round?.lot).toBe(12);
  });

  it("โปร 12 แถม 1 — แนะนำ 1 (8%) ยังไม่ซื้อรอบนี้", () => {
    expect(planPromoStepRound(buy12, 1)?.applied).toBe(0);
    expect(planPromoStepRound(buy12, 3)?.applied).toBe(0);
  });

  it("โปร 12 แถม 1 — แนะนำ 13 คิดจากเศษ 1 หีบ (12 แรกได้แถมไปแล้ว) เหลือ 12", () => {
    const round = planPromoStepRound(buy12, 13);
    expect(round?.applied).toBe(12);
    expect(round?.direction).toBe("down");
  });

  it("เศษเกิน 30% ของขั้นก็ปัดขึ้นแม้จะเลยขั้นแรกมาแล้ว", () => {
    // 17 = 12 + เศษ 5 (42%) → ขึ้นไป 24 · 15 = 12 + เศษ 3 (25%) → คงที่ 12
    expect(planPromoStepRound(buy12, 17)?.applied).toBe(24);
    expect(planPromoStepRound(buy12, 15)?.applied).toBe(12);
  });

  it("ล็อตเกิน 12 หีบต้องถึงครึ่งขั้น — ครึ่งพอดียังไม่พอ", () => {
    expect(planPromoStepRound(buy24, 13)?.applied).toBe(24); // 54%
    expect(planPromoStepRound(buy24, 11)?.applied).toBe(0); // 46%
    expect(planPromoStepRound(buy24, 36)?.applied).toBe(24); // 50% พอดี = ไม่ขึ้น
    expect(planPromoStepRound(buy24, 26)?.applied).toBe(24);
  });

  it("ลงขั้นพอดี / ไม่สั่ง / ไม่มีโปรของแถม → ไม่ต้องปรับ", () => {
    expect(planPromoStepRound(buy12, 12)).toBeNull();
    expect(planPromoStepRound(buy12, 24)).toBeNull();
    expect(planPromoStepRound(buy12, 0)).toBeNull();
    expect(planPromoStepRound([discount(5)], 7)).toBeNull();
    expect(planPromoStepRound(undefined, 7)).toBeNull();
  });

  it("บันไดหลายขั้น — คิดสัดส่วนจากช่วงระหว่างขั้นที่ขนาบอยู่", () => {
    // 45 อยู่ระหว่าง 30 กับ 50 — เศษ 15 จากช่วง 20 = 75% → ขึ้น 50
    expect(planPromoStepRound(ladder, 45)?.applied).toBe(50);
    // 35 — เศษ 5 จากช่วง 20 = 25% → คงที่ 30
    expect(planPromoStepRound(ladder, 35)?.applied).toBe(30);
    // 60 อยู่ระหว่าง 50 กับ 100 — เศษ 10 จากช่วง 50 = 20% → คงที่ 50
    expect(planPromoStepRound(ladder, 60)?.applied).toBe(50);
  });
});

describe("planPromoGroupStepRound", () => {
  const lot24 = [premium(24, 6)];
  const lot12 = [premium(12)];

  it("ยอดรวมถึงสัดส่วนแล้ว → เติมส่วนที่ขาดที่ SKU ที่ควรสั่งมากสุด", () => {
    const round = planPromoGroupStepRound(lot24, [
      { skuCode: "A", qty: 12, suggestOrder: 5 },
      { skuCode: "B", qty: 8, suggestOrder: 9 },
    ]);
    expect(round?.target).toBe(24); // รวม 20 = 83% ของขั้น
    expect(round?.changes).toEqual([{ skuCode: "B", from: 8, to: 12 }]);
  });

  it("ยอดรวมยังไม่ถึงสัดส่วน → ทั้งกลุ่มยังไม่ซื้อรอบนี้", () => {
    const round = planPromoGroupStepRound(lot24, [
      { skuCode: "A", qty: 2, suggestOrder: 5 },
      { skuCode: "B", qty: 3, suggestOrder: 9 },
    ]);
    expect(round?.target).toBe(0);
    expect(round?.changes).toEqual([
      { skuCode: "B", from: 3, to: 0 },
      { skuCode: "A", from: 2, to: 0 },
    ]);
  });

  it("เกินขั้นนิดเดียว → ตัดเศษจากบรรทัดที่สั่งเยอะสุด ไม่มีใครติดลบ", () => {
    const round = planPromoGroupStepRound(lot24, [
      { skuCode: "A", qty: 20, suggestOrder: 9 },
      { skuCode: "B", qty: 6, suggestOrder: 4 },
    ]);
    expect(round?.target).toBe(24);
    expect(round?.changes).toEqual([{ skuCode: "A", from: 20, to: 18 }]);
  });

  it("ตัดเศษเกินกว่าบรรทัดเดียวจะรับไหว → ไล่ตัดหลายบรรทัด", () => {
    const round = planPromoGroupStepRound(lot12, [
      { skuCode: "A", qty: 1, suggestOrder: 1 },
      { skuCode: "B", qty: 1, suggestOrder: 1 },
      { skuCode: "C", qty: 12, suggestOrder: 1 },
    ]);
    // รวม 14 → เศษ 2 หีบ (17%) ตัดทิ้ง เหลือ 12
    expect(round?.target).toBe(12);
    expect(round?.changes).toEqual([
      { skuCode: "C", from: 12, to: 10 },
    ]);
  });

  it("ยอดรวมลงตัว / ไม่มีใครสั่ง → ไม่ต้องปรับ", () => {
    expect(
      planPromoGroupStepRound(lot24, [
        { skuCode: "A", qty: 20 },
        { skuCode: "B", qty: 4 },
      ])
    ).toBeNull();
    expect(
      planPromoGroupStepRound(lot24, [
        { skuCode: "A", qty: 0 },
        { skuCode: "B", qty: 0 },
      ])
    ).toBeNull();
  });
});

