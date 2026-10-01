import { describe, expect, it } from "vitest";
import { promoRowsCoverCurrentMonth } from "@/lib/fabric/promo-month-watch";

// วันที่จาก CSV parse เป็น UTC เที่ยงคืน — แบบเดียวกับ promotion-credit
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (from: string | null, to: string | null) => ({
  fromDate: from ? d(from) : null,
  toDate: to ? d(to) : null,
});

describe("promoRowsCoverCurrentMonth", () => {
  const oct1 = new Date("2026-10-01T10:00:00+07:00");

  it("ไฟล์ที่มีแต่โปรเดือนก่อน = ยังไม่มีเดือนนี้ (เหตุการณ์ 1 ต.ค. 69)", () => {
    expect(
      promoRowsCoverCurrentMonth([row("2026-09-01", "2026-09-30")], oct1)
    ).toBe(false);
  });

  it("เจอแถวของเดือนนี้แล้ว = หยุดดึง", () => {
    expect(
      promoRowsCoverCurrentMonth(
        [row("2026-09-01", "2026-09-30"), row("2026-10-01", "2026-10-31")],
        oct1
      )
    ).toBe(true);
  });

  it("โปรคร่อมเดือนนับเป็นของเดือนนี้ด้วย — ตรงกับหน้าโปร C4", () => {
    expect(
      promoRowsCoverCurrentMonth([row("2026-09-25", "2026-10-10")], oct1)
    ).toBe(true);
  });

  it("ไฟล์ที่มีแต่โปรเดือนหน้า ยังไม่นับว่ามีเดือนนี้", () => {
    expect(
      promoRowsCoverCurrentMonth([row("2026-11-01", "2026-11-30")], oct1)
    ).toBe(false);
  });

  it("ก่อน 07:00 วันที่ 1 ยังเป็นเดือนใหม่ตามเวลาไทย ไม่ใช่เดือนก่อนตาม UTC", () => {
    const earlyOct1 = new Date("2026-10-01T02:00:00+07:00");
    expect(
      promoRowsCoverCurrentMonth([row("2026-09-01", "2026-09-30")], earlyOct1)
    ).toBe(false);
  });

  it("ไฟล์ว่าง = ยังไม่มี", () => {
    expect(promoRowsCoverCurrentMonth([], oct1)).toBe(false);
  });
});
