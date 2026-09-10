import { describe, expect, it } from "vitest";
import {
  filterStockRows,
  hideNoSalesApplies,
  isCriticalStock,
  isDeadStock,
  isSlowMoving,
  selectStockRows,
  SLOW_MOVER_MAX_FACTOR,
  type StockView,
} from "@/lib/stock/filters";
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

/**
 * ปุ่ม "ซ่อนของไม่ขาย 1 เดือน" — เคสจริงที่ผู้ใช้แจ้งว่า "กดซ่อนแล้วของยังขึ้นอยู่"
 *
 * ตัวกรองกันบางมุมมองไว้ไม่ให้ซ่อน (ไม่งั้นตารางว่างเปล่า) แต่ทูลบาร์เคยปิดปุ่มไม่ครบ
 * ปุ่มจึงไฟติดเขียวโดยไม่มีอะไรหาย — ตอนนี้ทั้งสองฝั่งอ่านจาก hideNoSalesApplies ตัวเดียวกัน
 */
describe("hideNoSales", () => {
  const dead = { noSales30: true, stock: 5, avgSales: 0 };
  const selling = { noSales30: false, stock: 5, avgSales: 2, needsOrder: true };
  const targetRow = { noSales30: true, stock: 0, avgSales: 0, fromTarget: true };
  const rows = [dead, selling, targetRow];

  const shown = (view: StockView, hideNoSales: boolean) =>
    filterStockRows(rows, { view, brand: null, section: null, hideNoSales });

  it("แท็บทั่วไป: เปิดปุ่มแล้วของไม่ขายต้องหายไปจริง", () => {
    expect(shown("all", false)).toHaveLength(2);
    expect(shown("all", true)).toEqual([selling]);
  });

  it("แท็บ “ไม่ขาย 1 เดือน” / “ค้างสต็อก”: ปุ่มต้องไม่มีผล และต้องบอกทูลบาร์ให้ปิดปุ่ม", () => {
    for (const view of ["noSales", "deadStock"] as const) {
      expect(hideNoSalesApplies(view)).toBe(false);
      expect(shown(view, true)).toEqual(shown(view, false));
      expect(shown(view, true)).toEqual([dead]);
    }
  });

  it("แท็บ “ควรมีขาย”: เปิดปุ่มค้างไว้แล้วสลับมา ต้องไม่ถูกล้างจนว่างเปล่า", () => {
    expect(hideNoSalesApplies("target")).toBe(false);
    expect(shown("target", true)).toEqual([targetRow]);
  });

  it("แท็บที่ไม่มีของไม่ขายอยู่แล้ว: กดแล้วผลลัพธ์เท่าเดิม (ปุ่มต้องบอกว่าไม่มีอะไรให้ซ่อน)", () => {
    expect(hideNoSalesApplies("needs")).toBe(true);
    expect(shown("needs", true)).toEqual(shown("needs", false));
  });
});

/**
 * ค้นหา + ปุ่มซ่อน — ผู้ใช้ค้นชื่อแบรนด์กว้าง ๆ แล้วได้ของตายปนมาเต็ม
 * แต่กดซ่อนไม่ได้ (ตอนนั้นปุ่มถูกปิดเพราะ "ค้นหาข้ามตัวกรองทุกตัว")
 *
 * ปุ่มนี้จึงเป็นข้อยกเว้นเดียวที่ยังทำงานตอนค้นหา ส่วนแท็บ/แบรนด์/กลุ่มยังถูกข้ามเหมือนเดิม
 */
describe("selectStockRows: ค้นหาแล้วกดซ่อน", () => {
  const rows = [
    { skuCode: "111", skuName: "เปาซิลเวอร์", brand: "เปา", noSales30: false, avgSales: 2 },
    { skuCode: "222", skuName: "เปาเอ็มวอช", brand: "เปา", noSales30: true, avgSales: 0 },
    { skuCode: "333", skuName: "เปาลิควิด", brand: "เปา", noSales30: true, fromTarget: true },
    { skuCode: "444", skuName: "บรีสเอกเซล", brand: "บรีส", noSales30: true, avgSales: 0 },
  ];
  const codes = (search: string, hideNoSales: boolean, view: StockView = "all") =>
    selectStockRows(rows, {
      search,
      filters: { view, brand: null, section: null, hideNoSales },
    }).map((r) => r.skuCode);

  it("ปิดปุ่ม: เจอทุกตัวที่ตรงคำค้น", () => {
    expect(codes("เปา", false)).toEqual(["111", "222", "333"]);
  });

  it("เปิดปุ่ม: ของไม่ขายในผลค้นหาต้องหายไปด้วย", () => {
    expect(codes("เปา", true)).toEqual(["111", "333"]);
  });

  it("สินค้าเป้าขายไม่ถูกซ่อน — ไม่งั้นค้นชื่อของที่ควรมีขายแล้วไม่เจอ", () => {
    expect(codes("เปาลิควิด", true)).toEqual(["333"]);
  });

  it("แท็บยังถูกข้ามตอนค้นหาเหมือนเดิม", () => {
    // อยู่แท็บ "ควรสั่ง" แต่ค้นชื่อของที่ไม่ได้อยู่ในแท็บนั้น ต้องยังเจอ
    expect(codes("บรีส", false, "needs")).toEqual(["444"]);
  });
});

/**
 * "หมุนช้า" — ช่องโหว่ที่คนใช้จริงเจอ: ของที่ขายเดือนละชิ้นหลุดทั้ง "ไม่ขาย 1 เดือน"
 * และ "ค้างสต็อก" เพราะยังมียอดขายอยู่นิดเดียว วัดจาก vda1 จริง: แท็บค้างสต็อก
 * 23 รายการ 16,875 บาท ส่วนของหมุนช้า 35 รายการ 121,786 บาท (มากกว่า 7 เท่า)
 */
describe("isSlowMoving", () => {
  const row = (stockCvd: number | null, over: Partial<Record<string, unknown>> = {}) => ({
    stock: 5,
    avgSales: 0.05,
    maxDays: 15,
    stockCvd,
    ...over,
  });

  it("ของพอขายเกิน 6 เท่าของ MAX = หมุนช้า (ค่าเริ่มต้น = เกิน 90 วัน)", () => {
    expect(isSlowMoving(row(91))).toBe(true);
    expect(isSlowMoving(row(90))).toBe(false);
  });

  it("เกณฑ์ขยับตาม MAX ของกลุ่มนั้น ไม่ใช่เลขวันตายตัว", () => {
    expect(isSlowMoving(row(91, { maxDays: 30 }))).toBe(false); // 30 × 6 = 180
    expect(isSlowMoving(row(181, { maxDays: 30 }))).toBe(true);
    expect(SLOW_MOVER_MAX_FACTOR).toBe(6);
  });

  it("ไม่มียอดขายเลย = เป็นงานของแท็บ 'ค้างสต็อก' ไม่ใช่แท็บนี้ (ไม่นับซ้ำ)", () => {
    expect(isSlowMoving(row(999, { avgSales: 0 }))).toBe(false);
  });

  it("ของหมดแล้ว = ไม่มีเงินจม", () => {
    expect(isSlowMoving(row(999, { stock: 0 }))).toBe(false);
  });

  it("แท็บ 'หมุนช้า' กับ 'ค้างสต็อก' ต้องไม่ทับกันเลย", () => {
    const rows = [
      { stock: 5, avgSales: 0.01, maxDays: 15, stockCvd: 500, noSales30: false },
      { stock: 5, avgSales: 0, maxDays: 15, stockCvd: null, noSales30: true },
    ];
    const slow = filterStockRows(rows, { view: "slow", brand: null, section: null, hideNoSales: false });
    const dead = filterStockRows(rows, { view: "deadStock", brand: null, section: null, hideNoSales: false });
    expect(slow).toHaveLength(1);
    expect(dead).toHaveLength(1);
    expect(slow[0]).not.toBe(dead[0]);
  });
});
