import { describe, expect, it } from "vitest";
import { getCvdFlag, getOrderCvdFlag } from "@/lib/calculations";

/**
 * ธง CVD — เคยเป็นต้นเหตุบั๊กที่ร้าน "ส่งออเดอร์ไม่ได้เลย"
 * (ของหมด สั่ง 1 หีบ → CVD ต่ำกว่า MIN → ติดแดง → ปุ่มส่งถูกปิดตาย)
 * เทสต์ชุดนี้ล็อกพฤติกรรมข้อยกเว้นไว้ไม่ให้หลุดอีก
 */
describe("getCvdFlag", () => {
  it("อยู่ในช่วง MIN–MAX = เขียว", () => {
    expect(getCvdFlag(10, 7, 15)).toBe("green");
  });

  it("เกิน MAX ได้ไม่เกิน 4 วัน ยังเขียว (เผื่อ lead time)", () => {
    expect(getCvdFlag(19, 7, 15)).toBe("green");
  });

  it("ต่ำกว่า MIN = แดง", () => {
    expect(getCvdFlag(3, 7, 15)).toBe("red");
  });

  it("เกินเพดานมาก = แดง", () => {
    expect(getCvdFlag(200, 7, 15)).toBe("red");
  });

  it("ประเมินไม่ได้ (null) = แดง", () => {
    expect(getCvdFlag(null, 7, 15)).toBe("red");
  });
});

describe("getOrderCvdFlag — ข้อยกเว้นที่ห้ามหาย", () => {
  it("ของหมด สั่งเท่าไรก็ไม่ถึง MIN → เตือนได้ แต่ห้ามกั้นการส่ง", () => {
    const r = getOrderCvdFlag(0, 1, 1.7, 7, 15);
    expect(r.reason).toBe("outOfStock");
    expect(r.blocking).toBe(false);
  });

  it("สั่ง 1 หีบซึ่งเป็นขั้นต่ำ แล้ว CVD ทะลุเพดาน → ลดเป็นเหลือง ไม่กั้น", () => {
    // ขายวันละ 0.02 หีบ สั่ง 1 หีบ = พอขาย 50 วัน แต่สั่งน้อยกว่านี้ไม่ได้
    const r = getOrderCvdFlag(0, 1, 0.02, 7, 15);
    expect(r.reason).toBe("minPack");
    expect(r.flag).toBe("yellow");
    expect(r.blocking).toBe(false);
  });

  it("ยังมีของ แต่สั่งน้อยจนไม่ถึง MIN → กั้นให้ยืนยันก่อน", () => {
    const r = getOrderCvdFlag(2, 1, 1, 7, 15);
    expect(r.reason).toBe("under");
    expect(r.blocking).toBe(true);
  });

  it("สั่งเยอะเกินเพดานมาก (มากกว่า 1 หีบ) → กั้นให้ยืนยันก่อน", () => {
    const r = getOrderCvdFlag(0, 500, 1, 7, 15);
    expect(r.reason).toBe("over");
    expect(r.blocking).toBe(true);
  });

  it("ไม่มียอดขายเฉลี่ย → ประเมินไม่ได้ ไม่ติดธง ไม่กั้น", () => {
    const r = getOrderCvdFlag(0, 10, 0, 7, 15);
    expect(r.flag).toBeNull();
    expect(r.blocking).toBe(false);
  });

  it("จำนวน 0 → ไม่ติดธง", () => {
    const r = getOrderCvdFlag(5, 0, 2, 7, 15);
    expect(r.flag).toBeNull();
    expect(r.blocking).toBe(false);
  });
});
