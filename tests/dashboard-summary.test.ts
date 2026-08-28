import { describe, expect, it } from "vitest";
import {
  calcApprovalRate,
  isRedFlag,
  rankRedFlagStores,
  type RedFlagItemRow,
} from "@/lib/sales/dashboard-summary";

/**
 * เกณฑ์ธงแดงต้องเป็นตัวเดียวกับ tests/cvd-flag.test.ts — ถ้าวันหนึ่งมีคนแก้
 * สูตรบนแดชบอร์ดให้ต่างจากหน้าออเดอร์ เทสต์ชุดนี้ต้องแดง
 */
function row(over: Partial<RedFlagItemRow> = {}): RedFlagItemRow {
  return {
    storeId: "s1",
    storeCode: "vda1",
    storeName: "คลัง 1",
    cvdEstimate: 14,
    minDays: 7,
    maxDays: 20,
    ...over,
  };
}

describe("isRedFlag", () => {
  it("อยู่ในช่วง MIN..MAX = ไม่แดง", () => {
    expect(isRedFlag(row({ cvdEstimate: 14 }))).toBe(false);
  });

  it("ต่ำกว่า MIN = แดง (เสี่ยงของขาด)", () => {
    expect(isRedFlag(row({ cvdEstimate: 3 }))).toBe(true);
  });

  it("ไม่มีค่า CVD = แดง — ไม่รู้ว่าพอหรือไม่ ต้องให้คนดู", () => {
    expect(isRedFlag(row({ cvdEstimate: null }))).toBe(true);
  });

  it("เกิน MAX มากพอ = แดง (ของค้างสต็อก)", () => {
    // greenCeil = 20+4 = 24 · yellowCeil = 24 + max(15, 13) = 39
    expect(isRedFlag(row({ cvdEstimate: 30 }))).toBe(false); // เหลือง ไม่ใช่แดง
    expect(isRedFlag(row({ cvdEstimate: 45 }))).toBe(true);
  });

  it("ไม่มี min/max ของร้าน → ใช้ค่ามาตรฐาน ไม่ throw", () => {
    expect(isRedFlag(row({ minDays: null, maxDays: null, cvdEstimate: 14 }))).toBe(
      false
    );
    expect(isRedFlag(row({ minDays: null, maxDays: null, cvdEstimate: 2 }))).toBe(
      true
    );
  });
});

describe("rankRedFlagStores", () => {
  it("นับธงแดงต่อร้านและคิดสัดส่วนถูกต้อง", () => {
    const ranked = rankRedFlagStores([
      row({ cvdEstimate: 2 }),
      row({ cvdEstimate: 3 }),
      row({ cvdEstimate: 14 }),
      row({ cvdEstimate: 15 }),
    ]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].redCount).toBe(2);
    expect(ranked[0].totalCount).toBe(4);
    expect(ranked[0].redPct).toBe(50);
  });

  it("เรียงร้านที่ธงแดงเยอะที่สุดขึ้นก่อน", () => {
    const ranked = rankRedFlagStores([
      row({ storeId: "a", storeCode: "vda1", cvdEstimate: 2 }),
      row({ storeId: "b", storeCode: "vda2", cvdEstimate: 2 }),
      row({ storeId: "b", storeCode: "vda2", cvdEstimate: 2 }),
    ]);

    expect(ranked.map((r) => r.storeCode)).toEqual(["vda2", "vda1"]);
  });

  it("ร้านที่ไม่มีธงแดงเลยไม่ขึ้นในอันดับ", () => {
    const ranked = rankRedFlagStores([
      row({ storeId: "a", storeCode: "vda1", cvdEstimate: 14 }),
      row({ storeId: "b", storeCode: "vda2", cvdEstimate: 2 }),
    ]);

    expect(ranked.map((r) => r.storeCode)).toEqual(["vda2"]);
  });

  it("จำนวนเท่ากัน → เรียงด้วยสัดส่วน แล้วค่อยรหัสร้าน (ลำดับนิ่ง)", () => {
    const ranked = rankRedFlagStores([
      // vda9: แดง 1 จาก 1 = 100%
      row({ storeId: "z", storeCode: "vda9", cvdEstimate: 2 }),
      // vda1: แดง 1 จาก 2 = 50%
      row({ storeId: "a", storeCode: "vda1", cvdEstimate: 2 }),
      row({ storeId: "a", storeCode: "vda1", cvdEstimate: 14 }),
    ]);

    expect(ranked.map((r) => r.storeCode)).toEqual(["vda9", "vda1"]);
  });

  it("ตัดตาม limit ที่ขอ", () => {
    const rows = ["a", "b", "c"].map((id) =>
      row({ storeId: id, storeCode: `vda${id}`, cvdEstimate: 2 })
    );
    expect(rankRedFlagStores(rows, 2)).toHaveLength(2);
  });

  it("ไม่มีข้อมูลเลย → อาร์เรย์ว่าง ไม่ throw", () => {
    expect(rankRedFlagStores([])).toEqual([]);
  });
});

describe("calcApprovalRate", () => {
  it("คิดจากออเดอร์ที่ตัดสินแล้วเท่านั้น", () => {
    const rate = calcApprovalRate({ approved: 8, rejected: 2 });
    expect(rate.decided).toBe(10);
    expect(rate.ratePct).toBe(80);
  });

  it("ยังไม่มีออเดอร์ที่ตัดสิน → null ไม่ใช่ 0% (ต่างกันบนหน้าจอ)", () => {
    const rate = calcApprovalRate({});
    expect(rate.decided).toBe(0);
    expect(rate.ratePct).toBeNull();
  });

  it("ปฏิเสธล้วน = 0%", () => {
    expect(calcApprovalRate({ rejected: 5 }).ratePct).toBe(0);
  });

  it("ออเดอร์ที่ยังรอตรวจไม่อยู่ในตัวหาร", () => {
    // ผู้เรียกส่งมาแค่ approved/rejected — pending ไม่มีทางหลุดเข้ามา
    const rate = calcApprovalRate({ approved: 3, rejected: 1 });
    expect(rate.decided).toBe(4);
  });
});
