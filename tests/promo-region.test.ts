import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PromotionCredit,
  normalizeRegionName,
  promoServesRegion,
  type PromoRow,
} from "@/lib/fabric/promotion-credit";

/**
 * โปรเฉพาะภาคของ C4
 *
 * `COUNTRY=Y` แปลว่า "โปรนี้ได้ทั้งประเทศ" — ไม่ใช่ชื่อภาคหนึ่ง ร้านทุกภาคต้องได้
 * ส่วนแถวที่ COUNTRY=N จะได้เฉพาะภาคที่ติด Y ไว้
 *
 * บั๊กที่ปักไว้: ระบบเคยตรึง region = "COUNTRY" ให้ทุกร้าน เงื่อนไขหลังของ
 * promoServesRegion เลยกลายเป็น has("COUNTRY") ซ้ำกับเงื่อนไขแรก → แถวเฉพาะภาค
 * 61 แถวในไฟล์เดือน ส.ค. 2026 ไม่มีทางเข้าเกณฑ์เลย ร้าน กทม./เหนือ ควรได้ลด 240
 * แต่ได้ 50 (ขาด 190/หีบ) โดยไม่มีอะไรเตือน
 */

const HEADER =
  "FROMDATE,TODATE,DIVISIONSALE,PRODUCTCODE,PURCHASEQUANTITYFROM,PURCHASEQUANTITYTO,PURCHASEUNIT,TOBREAKUP,COUNTRY,BANGKOK,CENTRAL,NORTHEAST,NORTH,SOUTH,CUSTOMERGROUP,DISCOUNTAMOUNT,DISCOUNTPERCENT,SPECIALUNITPRICE,MARKETINGUSER,PREMIUMPRODUCT,PREMIUMQUANTITY,PREMIUMUNIT,ASSORTEDPRODUCTGROUP,RECORDSTATUS,USERCODE,CREATEDATE,UpdateDate,MINIMUMPURCHASE";

const ALL_REGIONS = ["BANGKOK", "CENTRAL", "NORTHEAST", "NORTH", "SOUTH"];

function row(o: {
  product: string;
  regions: string[];
  discAmt?: number;
}): string {
  const on = (r: string) => (o.regions.includes(r) ? "Y" : "N");
  return [
    "2026-08-01T07:00:00.000+07:00",
    "2026-08-31T07:00:00.000+07:00",
    "E",
    o.product,
    "1.0",
    "9999.0",
    "B",
    "Y",
    on("COUNTRY"),
    on("BANGKOK"),
    on("CENTRAL"),
    on("NORTHEAST"),
    on("NORTH"),
    on("SOUTH"),
    "98",
    (o.discAmt ?? 0).toFixed(1),
    "0.0",
    "0.0",
    "MK102",
    "",
    "0.0",
    "",
    "",
    '""',
    "AM132",
    "2026-07-10T23:28:12.000+07:00",
    "2026-08-11 14:30:38",
    "1.0",
  ].join(",");
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-promo-region-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function load(rows: string[]): PromotionCredit {
  const file = path.join(dir, "cft_promotion_cash.csv");
  fs.writeFileSync(file, [HEADER, ...rows].join("\n"), "utf-8");
  const p = new PromotionCredit();
  p.load(file);
  return p;
}

function rowFor(p: PromotionCredit, product: string): PromoRow {
  const rows = p.rowsFor("E", "98", product);
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!;
}

describe("COUNTRY = ได้ทั้งประเทศ", () => {
  it("แถว COUNTRY ต้องผ่านทุกภาค ไม่มีข้อยกเว้น", () => {
    const p = load([row({ product: "100001", regions: ["COUNTRY"], discAmt: 50 })]);
    const r = rowFor(p, "100001");
    for (const region of ALL_REGIONS) {
      expect(promoServesRegion(r, region), region).toBe(true);
    }
  });

  it("แถว COUNTRY ผ่านแม้ผู้เรียกไม่ได้ส่งภาคมา (ยังไม่รู้ว่าร้านอยู่ภาคไหน)", () => {
    const p = load([row({ product: "100001", regions: ["COUNTRY"] })]);
    const r = rowFor(p, "100001");
    expect(promoServesRegion(r, "")).toBe(true);
    expect(promoServesRegion(r, "COUNTRY")).toBe(true);
  });
});

describe("แถวเฉพาะภาค", () => {
  it("ได้เฉพาะภาคที่ติด Y ภาคอื่นต้องไม่ได้", () => {
    // เคสจริง: 769109 ให้ กทม.+เหนือ ลด 240
    const p = load([
      row({ product: "769109", regions: ["BANGKOK", "NORTH"], discAmt: 240 }),
    ]);
    const r = rowFor(p, "769109");
    expect(promoServesRegion(r, "BANGKOK")).toBe(true);
    expect(promoServesRegion(r, "NORTH")).toBe(true);
    expect(promoServesRegion(r, "SOUTH")).toBe(false);
    expect(promoServesRegion(r, "CENTRAL")).toBe(false);
    expect(promoServesRegion(r, "NORTHEAST")).toBe(false);
  });

  it('ถาม region = "COUNTRY" กับแถวเฉพาะภาค ต้องไม่ผ่าน — นี่คือบั๊กเดิม', () => {
    const p = load([
      row({ product: "769109", regions: ["BANGKOK", "NORTH"], discAmt: 240 }),
    ]);
    expect(promoServesRegion(rowFor(p, "769109"), "COUNTRY")).toBe(false);
  });

  it("ร้านภาคใต้ได้แถวทั้งประเทศ แต่ไม่ได้แถวของ กทม.", () => {
    const p = load([
      row({ product: "769109", regions: ["BANGKOK", "NORTH"], discAmt: 240 }),
      row({ product: "769109", regions: ["COUNTRY"], discAmt: 50 }),
    ]);
    const rows = p.rowsFor("E", "98", "769109");
    const south = rows.filter((r) => promoServesRegion(r, "SOUTH"));
    const bkk = rows.filter((r) => promoServesRegion(r, "BANGKOK"));
    expect(south.map((r) => r.discAmt)).toEqual([50]);
    // กทม. เห็นทั้งสองแถว — ตัวเลือกที่ดีที่สุดคือ 240
    expect(bkk.map((r) => r.discAmt).sort((a, b) => a - b)).toEqual([50, 240]);
  });
});

describe("normalizeRegionName", () => {
  it('dim_customer เขียน "NORTH EAST" แต่หัวคอลัมน์ C4 คือ NORTHEAST', () => {
    const p = load([row({ product: "300001", regions: ["NORTHEAST"], discAmt: 5 })]);
    const r = rowFor(p, "300001");
    expect(promoServesRegion(r, "NORTH EAST")).toBe(true);
    expect(promoServesRegion(r, "north east")).toBe(true);
    expect(normalizeRegionName("NORTH EAST")).toBe("NORTHEAST");
  });

  it("ตัวพิมพ์เล็ก/ช่องว่างหน้าหลังไม่ทำให้พลาด", () => {
    const p = load([row({ product: "300002", regions: ["SOUTH"], discAmt: 5 })]);
    const r = rowFor(p, "300002");
    expect(promoServesRegion(r, " south ")).toBe(true);
  });

  it('"NORTH" ต้องไม่ไปเข้าเกณฑ์ของ "NORTHEAST"', () => {
    const p = load([row({ product: "300003", regions: ["NORTHEAST"], discAmt: 5 })]);
    expect(promoServesRegion(rowFor(p, "300003"), "NORTH")).toBe(false);
  });
});

describe("hasActivePromoToday ใช้กติกาภาคเดียวกัน", () => {
  it("แถวทั้งประเทศนับว่ามีโปรทุกภาค แถวเฉพาะภาคนับเฉพาะภาคนั้น", () => {
    const p = load([
      row({ product: "400001", regions: ["COUNTRY"], discAmt: 10 }),
      row({ product: "400002", regions: ["BANGKOK"], discAmt: 10 }),
    ]);
    const day = new Date("2026-08-15T00:00:00+07:00");
    expect(p.hasActivePromoToday("E", "98", "400001", "SOUTH", day)).toBe(true);
    expect(p.hasActivePromoToday("E", "98", "400002", "SOUTH", day)).toBe(false);
    expect(p.hasActivePromoToday("E", "98", "400002", "BANGKOK", day)).toBe(true);
  });
});
