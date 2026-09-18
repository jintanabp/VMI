import { describe, expect, it } from "vitest";
import { evaluatePooledDiscountConsistency } from "@/lib/calculations";

/**
 * ด่านเตือนความผิดปกติ (ไม่บล็อกการส่ง): สมาชิกกลุ่มโปรเดียวกันในออเดอร์เดียวกัน
 * ต้องได้ discountBaht/discountPct/currentPromo ตรงกันทุกตัว และ pooledQty ต้อง
 * เท่ากับผลรวมจำนวนที่สั่งจริงของสมาชิกกลุ่ม — ถ้าไม่ตรงคือสัญญาณว่าคำนวณมา
 * คนละแหล่งกัน (รูปแบบเดียวกับบั๊กที่เจอจริง)
 */
describe("evaluatePooledDiscountConsistency", () => {
  it("สมาชิกกลุ่มตรงกันทุกตัว ไม่ติดธง", () => {
    const result = evaluatePooledDiscountConsistency([
      {
        skuCode: "311282",
        finalQty: 2,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 6,
        c4DiscountBaht: 140,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 140.00 บาท/หีบ",
      },
      {
        skuCode: "317081",
        finalQty: 4,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 6,
        c4DiscountBaht: 140,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 140.00 บาท/หีบ",
      },
    ]);
    expect(result.get("311282")).toEqual({ flagged: false, reason: null });
    expect(result.get("317081")).toEqual({ flagged: false, reason: null });
  });

  it("ตัวเลขถูกแต่ข้อความผิด (บั๊กที่เจอจริง) — ติดธง group_mismatch ทั้งสองตัว", () => {
    const result = evaluatePooledDiscountConsistency([
      {
        skuCode: "311282",
        finalQty: 2,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 6,
        c4DiscountBaht: 140,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 63.00 บาท/หีบ", // ผิด — ไม่ตรงกับ discountBaht ที่ 140
      },
      {
        skuCode: "317081",
        finalQty: 4,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 6,
        c4DiscountBaht: 140,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 140.00 บาท/หีบ",
      },
    ]);
    expect(result.get("311282")).toEqual({
      flagged: true,
      reason: "group_mismatch",
    });
    expect(result.get("317081")).toEqual({
      flagged: true,
      reason: "group_mismatch",
    });
  });

  it("pooledQty ไม่เท่ากับผลรวมจำนวนที่สั่งจริง — ติดธง pooled_qty_mismatch", () => {
    const result = evaluatePooledDiscountConsistency([
      {
        skuCode: "311282",
        finalQty: 2,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 2, // ควรเป็น 6 (2+4) แต่ค้างจากรอบก่อนหน้า
        c4DiscountBaht: 63,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 63.00 บาท/หีบ",
      },
      {
        skuCode: "317081",
        finalQty: 4,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 2,
        c4DiscountBaht: 63,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 63.00 บาท/หีบ",
      },
    ]);
    expect(result.get("311282")?.flagged).toBe(true);
    expect(result.get("311282")?.reason).toBe("pooled_qty_mismatch");
    expect(result.get("317081")?.flagged).toBe(true);
  });

  it("ไม่ใช่โปรกลุ่ม (c4PromoGroup เป็น null) ไม่ติดธงไม่ว่าค่าจะต่างกันแค่ไหน", () => {
    const result = evaluatePooledDiscountConsistency([
      {
        skuCode: "100001",
        finalQty: 1,
        c4PromoGroup: null,
        c4PooledQty: 1,
        c4DiscountBaht: 20,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 20.00 บาท/หีบ",
      },
      {
        skuCode: "100002",
        finalQty: 5,
        c4PromoGroup: null,
        c4PooledQty: 5,
        c4DiscountBaht: 999,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 999.00 บาท/หีบ",
      },
    ]);
    expect(result.get("100001")).toEqual({ flagged: false, reason: null });
    expect(result.get("100002")).toEqual({ flagged: false, reason: null });
  });

  it("กลุ่มที่มีสมาชิกในออเดอร์นี้แค่ตัวเดียวไม่มีอะไรให้เทียบ ไม่ติดธง", () => {
    const result = evaluatePooledDiscountConsistency([
      {
        skuCode: "311282",
        finalQty: 2,
        c4PromoGroup: "KT1000ppm",
        c4PooledQty: 6, // สมาชิกอื่นในกลุ่มอยู่ในสต็อกแต่ไม่ได้อยู่ในออเดอร์นี้
        c4DiscountBaht: 140,
        c4DiscountPct: null,
        c4PromoLabel: "ลด 140.00 บาท/หีบ",
      },
    ]);
    expect(result.get("311282")).toEqual({ flagged: false, reason: null });
  });
});
