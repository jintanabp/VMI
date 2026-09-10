import { describe, expect, it } from "vitest";
import { getPendingTierDiscount } from "@/lib/calculations";

/**
 * โหมดโปรโมชั่นเคยขึ้นขีด "—" ในช่องส่วนลดของแถวที่ยังไม่ได้ใส่จำนวน ทั้งที่หัวการ์ดกลุ่ม
 * ข้างบนเขียนว่า "ซื้อ 1+ หีบ ลด 57.75 บาท/หีบ" — คนอ่านแล้วสรุปว่าของพวกนี้ไม่เข้าโปร
 *
 * ตัวเลขที่เป็นเงินยังผูกกับจำนวนที่สั่งจริงเหมือนเดิม อันนี้เป็นแค่ "ขั้นที่ยังไม่ถึง"
 */
const tier = (minQty: number, discBaht?: number, discPct?: number) => ({
  minQty,
  discount: "",
  sortOrder: minQty,
  discBaht,
  discPct,
});

describe("getPendingTierDiscount", () => {
  it("ยังไม่ได้สั่ง → บอกส่วนลดของขั้นแรก", () => {
    expect(getPendingTierDiscount(0, [tier(1, 57.75), tier(12, 80)])).toEqual({
      minQty: 1,
      discBaht: 57.75,
      discPct: null,
    });
  });

  it("สั่งถึงขั้นแรกแล้ว → บอกขั้นถัดไป ไม่ใช่ขั้นที่ได้ไปแล้ว", () => {
    expect(getPendingTierDiscount(5, [tier(1, 57.75), tier(12, 80)])?.minQty).toBe(12);
  });

  it("อยู่ขั้นสูงสุดแล้ว → ไม่มีอะไรรออยู่", () => {
    expect(getPendingTierDiscount(20, [tier(1, 57.75), tier(12, 80)])).toBeNull();
  });

  it("โปรของแถมล้วน (ไม่มีส่วนลดเงิน) → ไม่ต้องโชว์ในช่องส่วนลด", () => {
    expect(getPendingTierDiscount(0, [tier(12)])).toBeNull();
  });

  it("รองรับส่วนลดเป็นเปอร์เซ็นต์", () => {
    expect(getPendingTierDiscount(0, [tier(3, undefined, 5)])).toEqual({
      minQty: 3,
      discBaht: null,
      discPct: 5,
    });
  });

  it("ไม่มีโปรเลย → null", () => {
    expect(getPendingTierDiscount(0, [])).toBeNull();
    expect(getPendingTierDiscount(0, null)).toBeNull();
  });
});
