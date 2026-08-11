import { describe, expect, it } from "vitest";
import { preferInsertedWindow } from "@/lib/fabric/promotion-lookup";
import type { PromoRow } from "@/lib/fabric/promotion-credit";

/**
 * เลือกโปรเมื่อมีหลายช่วงที่ใช้ได้พร้อมกัน
 *
 * ทีมมาร์เก็ตติ้งแทรกโปรช่วงสั้นทับโปรประจำเดือนเป็นเรื่องปกติ ตัวที่แทรกคือตัวที่
 * ต้องใช้ ก่อนหน้านี้ไม่มีกฎเลย — promoRowsToTiers dedupe ตาม minQty แบบใครมาก่อน
 * ได้ก่อน ผลจึงขึ้นกับลำดับแถวในไฟล์ ซึ่งสลับกันเองได้ทุกรอบ sync
 */

function row(o: {
  from?: string;
  to?: string;
  fromQty?: number;
  discAmt?: number;
}): PromoRow {
  return {
    division: "E",
    product: "467787",
    cusgroup: "98",
    poolKey: "467787",
    fromQty: o.fromQty ?? 1,
    toQty: 9999,
    unit: "B",
    discAmt: o.discAmt ?? 0,
    discPct: 0,
    premiumProduct: "",
    premiumQty: 0,
    premiumUnit: "",
    minPurchase: 0,
    regions: new Set(["COUNTRY"]),
    fromDate: o.from ? new Date(`${o.from}T00:00:00Z`) : null,
    toDate: o.to ? new Date(`${o.to}T00:00:00Z`) : null,
    raw: {},
  };
}

describe("preferInsertedWindow", () => {
  it("ช่วงสั้นที่แทรกเข้ามาชนะโปรประจำเดือน", () => {
    const monthly = row({ from: "2026-08-01", to: "2026-08-31", discAmt: 170 });
    const inserted = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 250 });

    const out = preferInsertedWindow([monthly, inserted]);

    expect(out).toEqual([inserted]);
  });

  it("ลำดับแถวในไฟล์ต้องไม่มีผลกับผลลัพธ์", () => {
    const monthly = row({ from: "2026-08-01", to: "2026-08-31", discAmt: 170 });
    const inserted = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 250 });

    expect(preferInsertedWindow([inserted, monthly])).toEqual([inserted]);
    expect(preferInsertedWindow([monthly, inserted])).toEqual([inserted]);
  });

  it("ช่วงเท่ากันทั้งหมด = ขั้นบันไดของโปรเดียวกัน ต้องเก็บครบทุกขั้น", () => {
    const t1 = row({ from: "2026-08-01", to: "2026-08-31", fromQty: 1, discAmt: 20 });
    const t2 = row({ from: "2026-08-01", to: "2026-08-31", fromQty: 10, discAmt: 30 });
    const t3 = row({ from: "2026-08-01", to: "2026-08-31", fromQty: 25, discAmt: 40 });

    expect(preferInsertedWindow([t1, t2, t3])).toHaveLength(3);
  });

  it("โปรที่แทรกมีหลายขั้น ต้องได้ครบทุกขั้นของช่วงนั้น", () => {
    const monthly = row({ from: "2026-08-01", to: "2026-08-31", fromQty: 1, discAmt: 20 });
    const a = row({ from: "2026-08-10", to: "2026-08-16", fromQty: 1, discAmt: 50 });
    const b = row({ from: "2026-08-10", to: "2026-08-16", fromQty: 10, discAmt: 80 });

    const out = preferInsertedWindow([monthly, a, b]);

    expect(out).toHaveLength(2);
    expect(out.map((r) => r.discAmt).sort((x, y) => x - y)).toEqual([50, 80]);
  });

  it("ช่วงสั้นเท่ากันหลายอัน → เอาอันที่เริ่มทีหลัง", () => {
    const older = row({ from: "2026-08-03", to: "2026-08-09", discAmt: 50 });
    const newer = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 80 });

    expect(preferInsertedWindow([older, newer])).toEqual([newer]);
  });

  it("แถวที่ไม่มีวันที่ถือว่าเปิดปลาย — ไม่ไปเบียดโปรที่มีช่วงชัดเจน", () => {
    const openEnded = row({ discAmt: 10 });
    const dated = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 80 });

    expect(preferInsertedWindow([openEnded, dated])).toEqual([dated]);
  });

  it("ไม่มีแถวไหนมีวันที่เลย → ปล่อยผ่านทั้งหมด ดีกว่าเดาสุ่ม", () => {
    const a = row({ discAmt: 10 });
    const b = row({ discAmt: 20 });

    expect(preferInsertedWindow([a, b])).toHaveLength(2);
  });

  it("แถวเดียวก็ต้องได้แถวนั้น", () => {
    const only = row({ from: "2026-08-01", to: "2026-08-31", discAmt: 170 });
    expect(preferInsertedWindow([only])).toEqual([only]);
    expect(preferInsertedWindow([])).toEqual([]);
  });
});
