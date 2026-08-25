import { describe, expect, it } from "vitest";
import { preferInsertedWindow } from "@/lib/fabric/promotion-lookup";
import {
  promoServesMonthOf,
  type PromoRow,
} from "@/lib/fabric/promotion-credit";

/** วันที่โปรแทรก 10-16 ส.ค. ยังวิ่งอยู่ */
const DURING = new Date("2026-08-12T03:00:00Z");
/** ปลายเดือน — โปรแทรกจบไปแล้ว แต่โปรประจำเดือนยังวิ่ง */
const AFTER = new Date("2026-08-25T03:00:00Z");

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

    const out = preferInsertedWindow([monthly, inserted], DURING);

    expect(out).toEqual([inserted]);
  });

  it("ลำดับแถวในไฟล์ต้องไม่มีผลกับผลลัพธ์", () => {
    const monthly = row({ from: "2026-08-01", to: "2026-08-31", discAmt: 170 });
    const inserted = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 250 });

    expect(preferInsertedWindow([inserted, monthly], DURING)).toEqual([inserted]);
    expect(preferInsertedWindow([monthly, inserted], DURING)).toEqual([inserted]);
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

    const out = preferInsertedWindow([monthly, a, b], DURING);

    expect(out).toHaveLength(2);
    expect(out.map((r) => r.discAmt).sort((x, y) => x - y)).toEqual([50, 80]);
  });

  it("ช่วงสั้นเท่ากันหลายอัน → เอาอันที่เริ่มทีหลัง", () => {
    const older = row({ from: "2026-08-03", to: "2026-08-09", discAmt: 50 });
    const newer = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 80 });

    expect(preferInsertedWindow([older, newer], DURING)).toEqual([newer]);
  });

  it("แถวที่ไม่มีวันที่ถือว่าเปิดปลาย — ไม่ไปเบียดโปรที่มีช่วงชัดเจน", () => {
    const openEnded = row({ discAmt: 10 });
    const dated = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 80 });

    expect(preferInsertedWindow([openEnded, dated], DURING)).toEqual([dated]);
  });

  it("ไม่มีแถวไหนมีวันที่เลย → ปล่อยผ่านทั้งหมด ดีกว่าเดาสุ่ม", () => {
    const a = row({ discAmt: 10 });
    const b = row({ discAmt: 20 });

    expect(preferInsertedWindow([a, b])).toHaveLength(2);
  });

  it("โปรแทรกที่จบไปแล้ว ต้องไม่ไปบังโปรประจำเดือนที่ยังวิ่งอยู่", () => {
    // ด่านวันที่เป็น "ทั้งเดือน" แถว 10-16 ส.ค. จึงรอดมาถึงตรงนี้ทั้งที่จบไปแล้ว
    // ถ้าไม่คัดตัวที่ยังวิ่งอยู่ก่อน กฎ "ช่วงแคบชนะ" จะยกให้แถวที่ใช้ไม่ได้แล้ว
    const monthly = row({ from: "2026-08-01", to: "2026-08-31", discAmt: 170 });
    const ended = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 250 });

    expect(preferInsertedWindow([monthly, ended], AFTER)).toEqual([monthly]);
  });

  it("ไม่มีแถวไหนวิ่งอยู่วันนี้เลย → ยังเลือกตัวที่แทรกล่าสุดตามเดิม", () => {
    // ทั้งคู่จบไปแล้ว ณ ปลายเดือน — ไม่มีอะไรให้คัด จึงกลับไปใช้กฎช่วงแคบ/เริ่มทีหลัง
    const early = row({ from: "2026-08-03", to: "2026-08-09", discAmt: 50 });
    const later = row({ from: "2026-08-10", to: "2026-08-16", discAmt: 80 });

    expect(preferInsertedWindow([early, later], AFTER)).toEqual([later]);
  });

  it("แถวเดียวก็ต้องได้แถวนั้น", () => {
    const only = row({ from: "2026-08-01", to: "2026-08-31", discAmt: 170 });
    expect(preferInsertedWindow([only])).toEqual([only]);
    expect(preferInsertedWindow([])).toEqual([]);
  });
});

/**
 * ด่านวันที่ที่ทั้งระบบใช้ร่วมกัน
 *
 * บั๊กที่ต้องกันไม่ให้กลับมา: หน้า /admin/promo กรองแบบ "ทับเดือนนี้" ส่วนหน้าสต็อก
 * กับหน้าออเดอร์กรองแบบ "active วันนี้" โปรที่ช่วงแคบกว่าเดือนจึงโผล่ในหน้าแอดมิน
 * พร้อมราคาหลังลด แต่หน้าร้านขึ้น "-" โดยไม่มีอะไรบอกว่าสองหน้าถามคนละคำถาม
 */
describe("promoServesMonthOf", () => {
  it("โปรที่จบไปแล้วต้นเดือน ยังนับว่าเป็นโปรของเดือนนี้", () => {
    expect(
      promoServesMonthOf(row({ from: "2026-08-03", to: "2026-08-09" }), AFTER)
    ).toBe(true);
  });

  it("โปรที่ยังไม่เริ่มแต่เริ่มในเดือนนี้ ก็นับ", () => {
    expect(
      promoServesMonthOf(row({ from: "2026-08-28", to: "2026-08-31" }), AFTER)
    ).toBe(true);
  });

  it("โปรเดือนก่อนที่จบไปแล้ว ไม่นับ", () => {
    expect(
      promoServesMonthOf(row({ from: "2026-07-01", to: "2026-07-31" }), AFTER)
    ).toBe(false);
  });

  it("โปรเดือนหน้า ไม่นับ", () => {
    expect(
      promoServesMonthOf(row({ from: "2026-09-01", to: "2026-09-30" }), AFTER)
    ).toBe(false);
  });

  it("โปรที่คร่อมเดือน นับเป็นของทั้งสองเดือน", () => {
    const straddle = row({ from: "2026-07-25", to: "2026-08-10" });
    expect(promoServesMonthOf(straddle, AFTER)).toBe(true);
    expect(promoServesMonthOf(straddle, new Date("2026-07-28T03:00:00Z"))).toBe(true);
  });

  it("แถวที่ไม่มีวันที่เลย ถือว่าใช้ได้เสมอ", () => {
    expect(promoServesMonthOf(row({}), AFTER)).toBe(true);
  });
});
