import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_SORT, sortStockRows, stockValueOf } from "@/lib/stock/sort";
import { resolveOrderLinePrice } from "@/lib/calculations";

/** รูปแถวขั้นต่ำที่ sortStockRows ต้องใช้ (ตัวจริงเป็น generic ไม่ได้ export type ออกมา) */
interface TestRow {
  skuCode: string;
  skuName: string;
  stock: number;
  avgSales: number;
  stockCvd: number | null;
  suggestOrder: number;
  promoGroup: string | null;
  promoGroupMembers: number;
}

function row(over: Partial<TestRow> & { skuCode: string }): TestRow {
  return {
    skuName: `สินค้า ${over.skuCode}`,
    stock: 0,
    avgSales: 0,
    stockCvd: null,
    suggestOrder: 0,
    promoGroup: null,
    promoGroupMembers: 0,
    ...over,
  };
}

describe("การเรียงตารางสต็อก", () => {
  it("ค่าเริ่มต้นคือรหัสสินค้าน้อยไปมาก", () => {
    expect(DEFAULT_STOCK_SORT).toEqual({ key: "code", dir: "asc" });
  });

  it("เรียงรหัสแบบตัวเลข ไม่ใช่ตัวอักษร (111294 ต้องมาก่อน 98)", () => {
    const sorted = sortStockRows(
      [row({ skuCode: "98" }), row({ skuCode: "111294" })],
      "code",
      "asc"
    );
    expect(sorted.map((r) => r.skuCode)).toEqual(["98", "111294"]);
  });

  it("เรียงจากมากไปน้อยได้", () => {
    const sorted = sortStockRows(
      [row({ skuCode: "100" }), row({ skuCode: "200" })],
      "code",
      "desc"
    );
    expect(sorted.map((r) => r.skuCode)).toEqual(["200", "100"]);
  });

  it("ค่า null ตกไปท้ายเสมอ ไม่ว่าเรียงทางไหน", () => {
    const rows = [
      row({ skuCode: "A", stockCvd: null }),
      row({ skuCode: "B", stockCvd: 5 }),
    ];
    expect(sortStockRows(rows, "cvd", "asc").map((r) => r.skuCode)).toEqual([
      "B",
      "A",
    ]);
    expect(sortStockRows(rows, "cvd", "desc").map((r) => r.skuCode)).toEqual([
      "B",
      "A",
    ]);
  });

  it("ไม่แก้ไขอาร์เรย์ต้นฉบับ", () => {
    const rows = [row({ skuCode: "2" }), row({ skuCode: "1" })];
    sortStockRows(rows, "code", "asc");
    expect(rows.map((r) => r.skuCode)).toEqual(["2", "1"]);
  });
});

describe("resolveOrderLinePrice — ลำดับความสำคัญของราคา", () => {
  it("พนักงานตั้งราคา ชนะทุกอย่าง", () => {
    expect(
      resolveOrderLinePrice({
        salesPriceOverride: 90,
        unitPriceOverride: 80,
        c4UnitPrice: 100,
      })
    ).toEqual({ unitPrice: 90, source: "sales" });
  });

  it("ไม่มีของพนักงาน → ใช้ราคาที่ร้านขอ", () => {
    expect(
      resolveOrderLinePrice({ unitPriceOverride: 80, c4UnitPrice: 100 })
    ).toEqual({ unitPrice: 80, source: "store" });
  });

  it("ไม่มีใครแก้ → ใช้ราคาระบบ C4", () => {
    expect(resolveOrderLinePrice({ c4UnitPrice: 100 })).toEqual({
      unitPrice: 100,
      source: "c4",
    });
  });

  it("ไม่มีราคาเลย → null และบอกว่า none", () => {
    expect(resolveOrderLinePrice({})).toEqual({
      unitPrice: null,
      source: "none",
    });
  });

  it("ราคา 0 ถือว่าเป็นราคาที่ตั้งใจ ไม่ใช่ค่าว่าง", () => {
    expect(resolveOrderLinePrice({ salesPriceOverride: 0, c4UnitPrice: 100 })).toEqual(
      { unitPrice: 0, source: "sales" }
    );
  });
});

/**
 * เรียงตามมูลค่าเงินที่จมอยู่ — เพิ่มมาเพื่อให้แท็บ "ค้างสต็อก"/"หมุนช้า" บอกได้ว่า
 * ตัวไหนควรเร่งระบายก่อน (vda1: ตัวหนักสุด 2,970 บาท เบาสุดหลักสิบ)
 */
describe("มูลค่าคงเหลือ", () => {
  it("ใช้ต้นทุนจริงถ้ามี", () => {
    expect(stockValueOf({ stockValue: 1500, stock: 3, unitPrice: 100 })).toBe(1500);
  });

  it("ไม่มีต้นทุน → ประมาณจากราคาขาย (กติกาเดียวกับไฟล์ Excel)", () => {
    expect(stockValueOf({ stockValue: null, stock: 3, unitPrice: 100 })).toBe(300);
  });

  it("ไม่รู้ทั้งต้นทุนและราคาขาย → null (ไปท้ายตารางเสมอ)", () => {
    expect(stockValueOf({ stockValue: null, stock: 3, unitPrice: null })).toBeNull();
  });

  it("เรียงมาก → น้อย เอาเงินจมก้อนใหญ่ขึ้นก่อน", () => {
    const rows = [
      { skuCode: "A", stockValue: 100, stock: 1, unitPrice: 100 },
      { skuCode: "B", stockValue: 2970, stock: 28, unitPrice: 105 },
      { skuCode: "C", stockValue: null, stock: 2, unitPrice: 50 },
    ];
    expect(sortStockRows(rows, "stockValue", "desc").map((r) => r.skuCode)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });
});
