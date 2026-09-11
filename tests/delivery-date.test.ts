import { describe, expect, it } from "vitest";
import {
  addDays,
  checkDeliveryDate,
  defaultDeliveryDate,
  DELIVERY_DATE_MAX_AHEAD_DAYS,
  earliestDeliveryDate,
  thaiShortDate,
} from "@/lib/orders/delivery-date";
import { LEAD_TIME_DAYS } from "@/lib/calculations";
import { erpDeliveryDate } from "@/lib/po/erp-context";

/**
 * วันรับของที่ร้านเลือกตอนกดส่ง
 *
 * กติกา (พี่เคาะ 11 ก.ย. 69): เริ่มที่วันนี้ + lead time · เลื่อนไปหลังจากนั้นได้ · เร็วกว่านั้นไม่ได้
 *
 * ที่ต้องระวังที่สุดคือ**โซนเวลา** — เซิร์ฟเวอร์รันโซนไหนก็ได้ แต่ "วันนี้" ต้องเป็นวันไทย
 * เสมอ ไม่งั้นร้านที่กดส่งตอนหัวค่ำจะโดนบอกว่าเลือกวันในอดีตทั้งที่เลือกพรุ่งนี้
 */

/** 20:00 ของวันที่ 11 ก.ย. เวลาไทย = 13:00Z — ช่วงที่โซนเวลาทำให้วันเพี้ยนได้ */
const EVENING_BKK = new Date("2026-09-11T13:00:00Z");
/** 06:00 เช้าเวลาไทย = 23:00Z ของวันก่อนหน้า — เพี้ยนอีกทางหนึ่ง */
const MORNING_BKK = new Date("2026-09-10T23:00:00Z");

describe("วันรับของที่เร็วที่สุด", () => {
  it("= วันนี้ + LEAD_TIME_DAYS ไม่ใช่เลขที่ตั้งขึ้นเอง", () => {
    expect(LEAD_TIME_DAYS).toBe(3);
    expect(earliestDeliveryDate(EVENING_BKK)).toBe("2026-09-14");
  });

  it("ค่าตั้งต้นเท่ากับวันที่เร็วที่สุด", () => {
    expect(defaultDeliveryDate(EVENING_BKK)).toBe(earliestDeliveryDate(EVENING_BKK));
  });

  it("**หัวค่ำเวลาไทยยังนับเป็นวันเดียวกับตอนเช้า** — ไม่ใช่วันถัดไปตาม UTC", () => {
    expect(earliestDeliveryDate(EVENING_BKK)).toBe("2026-09-14");
    expect(earliestDeliveryDate(MORNING_BKK)).toBe("2026-09-14");
  });
});

describe("checkDeliveryDate", () => {
  it("วันที่เร็วที่สุดผ่าน", () => {
    expect(checkDeliveryDate("2026-09-14", EVENING_BKK)).toBeNull();
  });

  it("เลื่อนไปหลังจากนั้นได้", () => {
    expect(checkDeliveryDate("2026-09-30", EVENING_BKK)).toBeNull();
  });

  it("**เร็วกว่าที่กำหนดไม่ได้ และบอกวันที่เลือกได้จริง**", () => {
    const err = checkDeliveryDate("2026-09-13", EVENING_BKK);
    expect(err).not.toBeNull();
    expect(err).toContain("14 ก.ย. 69");
  });

  it("วันนี้เองก็ไม่ได้ — ของยังส่งไม่ทัน", () => {
    expect(checkDeliveryDate("2026-09-11", EVENING_BKK)).not.toBeNull();
  });

  it("ไกลเกินเพดานไม่ได้ — กันพิมพ์ปีผิด", () => {
    const far = addDays("2026-09-14", DELIVERY_DATE_MAX_AHEAD_DAYS + 1);
    expect(checkDeliveryDate(far, EVENING_BKK)).toContain("ไม่เกิน");
    expect(checkDeliveryDate("2099-01-01", EVENING_BKK)).not.toBeNull();
  });

  it("รูปแบบผิด หรือวันที่ไม่มีจริง ไม่ผ่าน", () => {
    expect(checkDeliveryDate("14/09/2026", EVENING_BKK)).not.toBeNull();
    expect(checkDeliveryDate("", EVENING_BKK)).not.toBeNull();
    expect(checkDeliveryDate("2026-02-31", EVENING_BKK)).not.toBeNull();
  });
});

describe("แปลงเป็นรูปแบบที่ ERP รับ", () => {
  it("เติมเที่ยงคืนต่อท้าย — ปลายทางเก็บเป็น DATE แต่รูปแบบต้องครบ", () => {
    expect(erpDeliveryDate("2026-09-14")).toBe("2026-09-14 00:00:00");
  });

  it("**ไม่มีวัน = null ห้ามเดาแทนร้าน**", () => {
    expect(erpDeliveryDate(null)).toBeNull();
  });
});

describe("thaiShortDate", () => {
  it("ออกเป็น พ.ศ. สองหลัก เหมือนที่อื่นทั้งแอป", () => {
    expect(thaiShortDate("2026-09-14")).toBe("14 ก.ย. 69");
  });
});
