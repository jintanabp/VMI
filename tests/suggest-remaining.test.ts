import { describe, expect, it } from "vitest";
import { suggestRemainingQty } from "@/lib/stock/suggest-remaining";
import type { StockRowComputed } from "@/lib/repositories/types";

/**
 * จำนวนแนะนำหลังหักของค้าง — /stock กับ /order ต้องได้เลขเดียวกัน
 *
 * เดิม /order ใช้ suggestOrder ดิบ ทำให้ตารางบอก "แนะนำอีก 4" แต่ปุ่ม/ชิปที่ /order
 * บอก "แนะนำ 10" แล้วพาสั่งซ้ำที่ตัวหักนี้ตั้งใจกันไว้
 */

function row(o: Partial<StockRowComputed> & { suggestOrder: number }): StockRowComputed {
  return {
    suggestOrder: o.suggestOrder,
    promoGroup: o.promoGroup ?? "",
    promoGroupMembers: o.promoGroupMembers ?? 0,
    promoTiers: o.promoTiers ?? [],
  } as StockRowComputed;
}

describe("suggestRemainingQty", () => {
  it("หักของค้างออกจากจำนวนแนะนำ", () => {
    expect(suggestRemainingQty(row({ suggestOrder: 10 }), 6)).toBe(4);
  });

  it("ค้างมากกว่าแนะนำ = 0 ไม่ติดลบ", () => {
    expect(suggestRemainingQty(row({ suggestOrder: 10 }), 15)).toBe(0);
  });

  it("ไม่มีของค้าง = จำนวนแนะนำเต็ม", () => {
    expect(suggestRemainingQty(row({ suggestOrder: 10 }), 0)).toBe(10);
  });

  it("suggestOrder ติดลบ/ศูนย์ = 0", () => {
    expect(suggestRemainingQty(row({ suggestOrder: 0 }), 0)).toBe(0);
    expect(suggestRemainingQty(row({ suggestOrder: -5 }), 0)).toBe(0);
  });

  it("pendingQty ติดลบถือเป็น 0 (กันข้อมูลเพี้ยนดันเลขเกิน)", () => {
    expect(suggestRemainingQty(row({ suggestOrder: 10 }), -3)).toBe(10);
  });

  it("มีโปรของแถมก็ไม่ปัดเข้าขั้น — เลขแนะนำต้องเป็นเลขที่สูตรคำนวณได้จริง", () => {
    // โปร 12 แถม 1: เดิมตรงนี้ดันเป็น 12 ตั้งแต่ต้นทาง ร้านเลยไม่เคยเห็นเลข 9
    // ตอนนี้ปล่อยผ่าน แล้วให้หน้าตรวจโปรตอนกด "ตรวจสอบคำสั่ง" เป็นคนตัดสิน
    const tiers = [
      {
        minQty: 12,
        discount: "แถม ×1",
        sortOrder: 12,
        kind: "premium" as const,
        premiumProduct: "P1",
        premiumQty: 1,
      },
    ];
    expect(suggestRemainingQty(row({ suggestOrder: 9, promoTiers: tiers }), 0)).toBe(9);
    expect(suggestRemainingQty(row({ suggestOrder: 10, promoTiers: tiers }), 9)).toBe(1);
  });

  it("โปรกลุ่ม (pooled) ไม่ snap ต่อบรรทัด — คืนเลขที่หักแล้วตรง ๆ", () => {
    // promoGroup + members >= 2 = pooled → ไม่ snapQtyToPromoStep
    const r = row({ suggestOrder: 10, promoGroup: "G1", promoGroupMembers: 3 });
    expect(suggestRemainingQty(r, 3)).toBe(7);
  });
});
