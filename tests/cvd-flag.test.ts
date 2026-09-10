import { describe, expect, it } from "vitest";
import { calcSuggestOrder, getCvdFlag, getOrderCvdFlag } from "@/lib/calculations";

/**
 * ธง CVD — เคยเป็นต้นเหตุบั๊กที่ร้าน "ส่งออเดอร์ไม่ได้เลย"
 * (ของหมด สั่ง 1 หีบ → CVD ต่ำกว่า MIN → ติดแดง → ปุ่มส่งถูกปิดตาย)
 * เทสต์ชุดนี้ล็อกพฤติกรรมข้อยกเว้นไว้ไม่ให้หลุดอีก
 */
describe("getCvdFlag", () => {
  it("อยู่ในช่วง MIN–MAX = เขียว", () => {
    expect(getCvdFlag(10, 7, 15)).toBe("green");
  });

  it("เกิน MAX ได้เท่ากับ lead time + เผื่อปัดหีบ ยังเขียว", () => {
    // สูตรแนะนำเล็งไปที่ MAX + lead time (15+3=18) แล้วปัดขึ้นเป็นหีบเต็ม
    // เพดานเขียวต้องครอบเป้าของสูตรตัวเอง ไม่งั้นระบบเตือนจำนวนที่ตัวเองแนะนำ
    expect(getCvdFlag(19, 7, 15)).toBe("green");
    expect(getCvdFlag(22, 7, 15)).toBe("green"); // 15 + 3 + 4
    expect(getCvdFlag(23, 7, 15)).toBe("yellow");
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

/**
 * "สั่งน้อยกว่านี้ไม่ได้แล้ว" — ของจริงที่เจอตอนให้คนลองใช้: 87 จาก 154 แถวที่ระบบ
 * แนะนำให้สั่ง ติดธงเตือนด้วยจำนวนที่ระบบแนะนำเอง เตือนเกินครึ่งแบบนี้คนจะเลิกอ่านธง
 */
describe("getOrderCvdFlag — จำนวนที่ลดไม่ได้แล้ว", () => {
  it("สั่ง 2 หีบ ลดเหลือ 1 แล้วของขาดก่อน MIN → ขั้นต่ำแล้ว ไม่ใช่สั่งเกิน", () => {
    // ขายวันละ 1/12 หีบ เหลือ 0: สั่ง 2 หีบ = 24 วัน (เกินเพดาน 22)
    // แต่ลดเหลือ 1 หีบ = 12 วัน ซึ่งต่ำกว่า MIN 14 → ลดไม่ได้
    const r = getOrderCvdFlag(0, 2, 1 / 12, 14, 15);
    expect(r.reason).toBe("minPack");
    expect(r.blocking).toBe(false);
  });

  it("สั่งเกินทั้งที่ลดได้ → ยังต้องเตือนและกั้นให้ยืนยัน", () => {
    // ขายวันละ 0.1 หีบ เหลือ 0: สั่ง 5 หีบ = 50 วัน · ลดเหลือ 4 หีบ = 40 วัน ยังเกิน MIN 5
    const r = getOrderCvdFlag(0, 5, 0.1, 5, 8);
    expect(r.reason).toBe("over");
    expect(r.blocking).toBe(true);
  });

  it("จำนวนที่สูตรแนะนำเอง (เติมถึง MAX + lead time) ต้องได้เขียว", () => {
    const avg = 1;
    const stock = 2;
    const qty = calcSuggestOrder(stock, avg, 7, 15); // = ceil(15-2+3) = 16
    expect(getOrderCvdFlag(stock, qty, avg, 7, 15).flag).toBe("green");
  });
});
