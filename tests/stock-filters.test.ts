import { describe, expect, it } from "vitest";
import { isCriticalStock, isDeadStock } from "@/lib/stock/filters";
import { calcSuggestOrder, LEAD_TIME_DAYS } from "@/lib/calculations";

/**
 * "ควรสั่ง" กับ "สต็อกวิกฤต" เคยเป็นเงื่อนไขเดียวกันโดยไม่มีใครรู้
 *
 * needsOrder มาจาก calcSuggestOrder ที่คืน 0 เมื่อ `stock >= avgSales × minDays`
 * ส่วนนิยามเดิมของ critical คือ `CVD < minDays` = `stock / avgSales < minDays`
 * ซึ่งเป็นสมการเดียวกัน ชิปสองอันจึงให้ผลลัพธ์ชุดเดียวกันเป๊ะทุกครั้ง
 * (ยืนยันจากการใช้งานจริง: ทั้งคู่ได้ 201 รายการ เรียงเหมือนกันทุกแถว)
 *
 * ตอนนี้ critical = "ของจะหมดก่อนของรอบใหม่มาถึง" ซึ่งแคบกว่าและเร่งด่วนกว่า
 */
const row = (stock: number, avgSales: number, minDays = 7) => ({
  stockCvd: avgSales > 0 ? stock / avgSales : null,
  avgSales,
  minDays,
  stock,
});

const needsOrder = (stock: number, avgSales: number, minDays = 7, maxDays = 15) =>
  calcSuggestOrder(stock, avgSales, minDays, maxDays) > 0;

describe("isCriticalStock", () => {
  it("ของจะหมดก่อนของใหม่มาถึง = วิกฤต", () => {
    // ขายวันละ 10 เหลือ 20 → อยู่ได้ 2 วัน < lead time 3 วัน
    expect(isCriticalStock(row(20, 10))).toBe(true);
  });

  it("อยู่ได้นานกว่า lead time = ยังไม่วิกฤต แม้จะต่ำกว่า MIN", () => {
    // ขายวันละ 10 เหลือ 50 → อยู่ได้ 5 วัน (เกิน lead time) แต่ยังต่ำกว่า MIN 7 วัน
    const r = row(50, 10);
    expect(isCriticalStock(r)).toBe(false);
    // แต่ยังต้องขึ้นในชิป "ควรสั่ง"
    expect(needsOrder(50, 10)).toBe(true);
  });

  it("**สองชิปต้องไม่ให้ผลเหมือนกัน** — นี่คือบั๊กที่เคยเกิด", () => {
    // แถวนี้ควรสั่ง แต่ไม่วิกฤต → ถ้าวันหนึ่งสองค่านี้ตรงกันอีก แปลว่านิยามกลับไปซ้ำกัน
    const stock = 50;
    const avg = 10;
    expect(needsOrder(stock, avg)).toBe(true);
    expect(isCriticalStock(row(stock, avg))).toBe(false);
  });

  it("ไม่มีการขาย = ไม่วิกฤต (ของไม่หมดเพราะไม่มีคนซื้อ)", () => {
    expect(isCriticalStock(row(0, 0))).toBe(false);
  });

  it("ของหมดแล้วและยังขายอยู่ = วิกฤต", () => {
    expect(isCriticalStock(row(0, 10))).toBe(true);
  });

  it("ปรับ lead time ได้ (เผื่อซัพช้าลง)", () => {
    const r = row(50, 10); // อยู่ได้ 5 วัน
    expect(isCriticalStock(r, LEAD_TIME_DAYS)).toBe(false);
    expect(isCriticalStock(r, 7)).toBe(true);
  });
});

describe("isDeadStock", () => {
  it("ไม่ขาย 30 วันและยังมีของค้าง = เงินจม", () => {
    expect(isDeadStock({ noSales30: true, stock: 12 })).toBe(true);
  });

  it("ไม่ขาย 30 วันแต่ของหมดแล้ว = แค่หยุดสั่งพอ ไม่ใช่เงินจม", () => {
    expect(isDeadStock({ noSales30: true, stock: 0 })).toBe(false);
  });

  it("ยังขายอยู่ = ไม่ใช่ของค้าง", () => {
    expect(isDeadStock({ noSales30: false, stock: 100 })).toBe(false);
  });
});
