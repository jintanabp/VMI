import { describe, expect, it } from "vitest";
import { daysError, isInvalidDaysValue } from "@/lib/stock/threshold-rules";

/**
 * ค่า MIN/MAX ที่พิมพ์ผิดต้องถูกกันตั้งแต่หน้าจอ และถ้าเล็ดลอดไปถึง API ต้องถูกปฏิเสธ
 *
 * เคสจริงที่เจอตอนให้คนลองใช้: ลบเลขทิ้งทั้งสองช่องในแผง "ตั้งค่าหลายแบรนด์" แล้วปุ่มยัง
 * กดได้ เพราะ `Number("")` = 0 ไม่ใช่ NaN — กดแล้วคือเขียน MIN 0 / MAX 0 ทับ 11 แบรนด์รวดเดียว
 */
describe("daysError", () => {
  it("ค่าปกติผ่าน", () => {
    expect(daysError("7", "15")).toBeNull();
    expect(daysError("0", "1")).toBeNull(); // MIN 0 = สั่งเมื่อของหมด ยังเป็นค่าที่ตั้งใจได้
  });

  it("**ช่องว่างต้องไม่ผ่าน** — นี่คือบั๊กที่เคยเกิด", () => {
    expect(daysError("", "")).toBe("กรอก MIN และ MAX ให้ครบ");
    expect(daysError("7", "")).toBe("กรอก MIN และ MAX ให้ครบ");
    expect(daysError(" ", "15")).toBe("กรอก MIN และ MAX ให้ครบ");
  });

  it("ค่าติดลบต้องบอกว่าติดลบ ไม่ใช่บอกว่า MAX น้อยกว่า MIN", () => {
    // เดิมพิมพ์ MIN -3 / MAX 10 แล้วขึ้น "MAX ต้อง ≥ MIN" ทั้งที่ 10 ≥ -3
    expect(daysError("-3", "10")).toBe("MIN ต้องไม่ติดลบ");
  });

  it("ทศนิยม / ตัวอักษร ไม่ผ่าน", () => {
    expect(daysError("2.7", "15")).toBe("MIN / MAX ต้องเป็นจำนวนเต็ม (วัน)");
    expect(daysError("abc", "15")).toBe("MIN / MAX ต้องเป็นจำนวนเต็ม (วัน)");
  });

  it("MAX ต้องมีอย่างน้อย 1 วัน และไม่น้อยกว่า MIN", () => {
    expect(daysError("0", "0")).toBe("MAX ต้องอย่างน้อย 1 วัน");
    expect(daysError("20", "2")).toBe("MAX ต้องไม่น้อยกว่า MIN");
  });

  it("กันค่าเว่อร์ที่พิมพ์พลาด", () => {
    expect(daysError("7", "99999")).toBe("MAX ต้องไม่เกิน 365 วัน");
  });
});

describe("isInvalidDaysValue", () => {
  it("ไม่ส่งฟิลด์มา = ตั้งใจใช้ค่าเริ่มต้น ไม่ใช่ค่าผิด", () => {
    expect(isInvalidDaysValue(undefined)).toBe(false);
    expect(isInvalidDaysValue(null)).toBe(false);
  });

  it("ค่าติดลบ/แปลไม่ได้ ต้องถูกปฏิเสธ ไม่ใช่แอบแทนด้วยค่าเริ่มต้น", () => {
    expect(isInvalidDaysValue(-5)).toBe(true);
    expect(isInvalidDaysValue("abc")).toBe(true);
    expect(isInvalidDaysValue(2.7)).toBe(true);
  });

  it("จำนวนเต็มไม่ติดลบผ่าน", () => {
    expect(isInvalidDaysValue(0)).toBe(false);
    expect(isInvalidDaysValue("15")).toBe(false);
  });
});
