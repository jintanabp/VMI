import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromotionCredit } from "@/lib/fabric/promotion-credit";
import {
  filterCandidateRows,
  getC4PromoForQty,
  lookupC4,
  promoRowsToTiers,
} from "@/lib/fabric/promotion-lookup";

/**
 * บั๊กที่เจอจริง (ข้อมูลจริงในกลุ่มโปร KT1000ppm): หน้าตรวจสอบคำสั่งซื้อโชว์
 * "ส่วนลด 140" (ตัวเลข, ถูก — คิดจากยอดรวมทั้งกลุ่ม 6 หีบ) แต่ "โปรที่ได้" (ข้อความ)
 * โชว์ "ลด 63 ขั้นสูงสุด" (ผิด) — ทั้งที่เป็น SKU เดียวกัน ตัวเลขกับข้อความควรตรงกัน
 *
 * สาเหตุจริง (ยืนยันจากไฟล์ cft_promotion_cash.csv): แถว "1-2 หีบ" (fromQty=1,
 * toQty=2, ลด 63) มี MINIMUMPURCHASE=6 กำกับไว้ — ทำให้ tierMinQty() จริงของแถวนี้
 * เป็น 6 (Math.max(fromQty, minPurchase)) ชนกับแถว "6+ หีบ" (fromQty=6, ลด 140)
 * ที่ tierMinQty ก็เป็น 6 เหมือนกัน สองแถวนี้ชนกันที่ minQty เดียวกันแต่ให้ส่วนลด
 * ต่างกัน — promoRowsToTiers (เดิม) dedupe แบบ "เจอก่อนได้ก่อน" ตามลำดับแถวในไฟล์
 * ซึ่งดันเจอแถว 63 ก่อนแถว 140 จึงทิ้งแถว 140 ไป ทั้งที่ lookupC4/activeTier (ที่ใช้
 * คิดตัวเลข) หาขั้นที่ active ได้ถูกต้องเป็น 140 อยู่แล้ว (คนละฟังก์ชัน คนละตรรกะ)
 *
 * แก้โดยให้ promoRowsToTiers เลือกแถวที่ "คุ้มกว่า" เมื่อ minQty ชนกัน (isBetterTierRow)
 * ไม่ใช่แถวแรกที่เจอ — ร้านที่เข้าเกณฑ์ขั้นหนึ่งต้องไม่เห็นขั้นที่ด้อยกว่าเพราะลำดับแถวในไฟล์
 */

const HEADER =
  "FROMDATE,TODATE,DIVISIONSALE,PRODUCTCODE,PURCHASEQUANTITYFROM,PURCHASEQUANTITYTO,PURCHASEUNIT,TOBREAKUP,COUNTRY,BANGKOK,CENTRAL,NORTHEAST,NORTH,SOUTH,CUSTOMERGROUP,DISCOUNTAMOUNT,DISCOUNTPERCENT,SPECIALUNITPRICE,MARKETINGUSER,PREMIUMPRODUCT,PREMIUMQUANTITY,PREMIUMUNIT,ASSORTEDPRODUCTGROUP,RECORDSTATUS,USERCODE,CREATEDATE,UpdateDate,MINIMUMPURCHASE";

function row(o: {
  product: string;
  group: string;
  fromQty: number;
  toQty: number;
  discAmt: number;
  minPurchase?: number;
}): string {
  return [
    "2026-09-01T07:00:00.000+07:00",
    "2026-09-30T07:00:00.000+07:00",
    "E",
    o.product,
    o.fromQty.toFixed(1),
    o.toQty.toFixed(1),
    "B",
    o.minPurchase ? "Y" : "N",
    "Y", // COUNTRY = ได้ทั้งประเทศ ไม่ต้องยุ่งกับภาค
    "N",
    "N",
    "N",
    "N",
    "N",
    "98",
    o.discAmt.toFixed(1),
    "0.0",
    "0.0",
    "MK101",
    "",
    "0.0",
    "",
    o.group,
    '""',
    "AM133",
    "2026-08-07T22:19:39.000+07:00",
    "2026-09-18 14:30:37",
    (o.minPurchase ?? 0).toFixed(1),
  ].join(",");
}

const GROUP = "KT1000ppm";
const SKU_A = "311282";
const SKU_B = "317081";
const DAY = new Date("2026-09-18T00:00:00+07:00");

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-promo-group-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// จำลองข้อมูลจริงของกลุ่ม KT1000ppm เป๊ะ ๆ — แถว "1-2 หีบ" มี MINIMUMPURCHASE=6
// ชนกับแถว "6+ หีบ" ที่ tierMinQty=6 เหมือนกัน ทั้งสอง SKU เหมือนกันทุกประการ
// (ไม่ใช่เรื่องแถวไม่ครบ/ไม่เท่ากันระหว่าง SKU — เป็นบั๊กในแถวของตัวเองล้วน ๆ)
function loadFixture(): PromotionCredit {
  const rows = [SKU_A, SKU_B].flatMap((sku) => [
    row({ product: sku, group: GROUP, fromQty: 1, toQty: 2, discAmt: 63, minPurchase: 6 }),
    row({ product: sku, group: GROUP, fromQty: 3, toQty: 5, discAmt: 100 }),
    row({ product: sku, group: GROUP, fromQty: 6, toQty: 9999, discAmt: 140 }),
  ]);
  const file = path.join(dir, "cft_promotion_cash.csv");
  fs.writeFileSync(file, [HEADER, ...rows].join("\n"), "utf-8");
  const p = new PromotionCredit();
  p.load(file);
  return p;
}

describe("โปรกลุ่ม C4 — MINIMUMPURCHASE ทำให้สองแถวชนกันที่ minQty เดียวกัน", () => {
  it("lookupC4 หาขั้น active ถูกต้อง (140) ทั้งสอง SKU เมื่อยอดรวมกลุ่มถึง 6", () => {
    const promo = loadFixture();
    const lookup = lookupC4(
      [
        { itemId: "0", product: SKU_A, qty: 2 },
        { itemId: "1", product: SKU_B, qty: 4 },
      ],
      { division: "E", cusgroup: "98", region: "BANGKOK", promo, day: DAY }
    );
    const a = lookup.lines.find((l) => l.itemId === "0")!;
    const b = lookup.lines.find((l) => l.itemId === "1")!;
    expect(a.pooledQty).toBe(6);
    expect(a.discountBaht).toBe(140);
    expect(b.discountBaht).toBe(140);
  });

  it("promoRowsToTiers (บั๊กเดิม): ถ้า dedupe แบบเจอก่อนได้ก่อน จะเลือกแถว 63 ทิ้งแถว 140 — เอาไว้ยืนยันว่าบั๊กเกิดจริง", () => {
    const promo = loadFixture();
    const rows = filterCandidateRows(promo, "E", "98", SKU_A, "BANGKOK", DAY);
    // จำลองพฤติกรรม "เจอก่อนได้ก่อน" ของโค้ดเดิมตรง ๆ โดยไม่ผ่านตัวเลือกที่แก้แล้ว
    const seen = new Set<number>();
    const naive = rows.filter((r) => {
      const minQty = Math.max(r.fromQty, r.minPurchase);
      if (seen.has(minQty)) return false;
      seen.add(minQty);
      return true;
    });
    const naiveTiers = naive.map((r) => ({
      minQty: Math.max(r.fromQty, r.minPurchase),
      discount: `${r.discAmt} บาท/หีบ`,
      sortOrder: Math.max(r.fromQty, r.minPurchase),
      kind: "discount_baht" as const,
      discBaht: r.discAmt,
    }));
    const oldText = getC4PromoForQty(6, naiveTiers);
    expect(oldText.currentPromo).toBe("ลด 63 บาท/หีบ"); // นี่คือบั๊กที่ผู้ใช้เจอจริง
  });

  it("promoRowsToTiers (แก้แล้ว): เลือกแถวที่คุ้มกว่า (140) ไม่ใช่แถวแรกที่เจอ — ข้อความตรงกับตัวเลข", () => {
    const promo = loadFixture();
    for (const sku of [SKU_A, SKU_B]) {
      const rows = filterCandidateRows(promo, "E", "98", sku, "BANGKOK", DAY);
      const tiers = promoRowsToTiers(rows);
      // ต้องเหลือ "ขั้นเดียว" ต่อ minQty=6 (ชนะกัน ไม่ใช่มีสองขั้นซ้อนกัน)
      expect(tiers.filter((t) => t.minQty === 6)).toHaveLength(1);
      const result = getC4PromoForQty(6, tiers);
      expect(result.currentPromo).toBe("ลด 140.00 บาท/หีบ");
      expect(result.nextPromo).toBeNull();
    }
  });

  it("จำนวนต่ำกว่าขั้นชนกัน (3-5 หีบ) ยังคงได้ขั้น 100 ตามปกติ ไม่ถูกผลของการแก้กระทบ", () => {
    const promo = loadFixture();
    const rows = filterCandidateRows(promo, "E", "98", SKU_A, "BANGKOK", DAY);
    const tiers = promoRowsToTiers(rows);
    expect(getC4PromoForQty(4, tiers).currentPromo).toBe("ลด 100.00 บาท/หีบ");
  });

  it("ยังไม่ถึงขั้นต่ำเลย (2 หีบ) ไม่ได้ส่วนลด — MINIMUMPURCHASE=6 บล็อกแถว 1-2 ไว้จริง", () => {
    const promo = loadFixture();
    const rows = filterCandidateRows(promo, "E", "98", SKU_A, "BANGKOK", DAY);
    const tiers = promoRowsToTiers(rows);
    expect(getC4PromoForQty(2, tiers).currentPromo).toBeNull();
  });

  it("poolRows ที่ lookupC4 เก็บไว้ (กันเคสแถวไม่ครบเท่ากันระหว่าง SKU ในกลุ่ม) ก็ให้ผลตรงกับตัวเลขเช่นกัน", () => {
    const promo = loadFixture();
    const lookup = lookupC4(
      [
        { itemId: "0", product: SKU_A, qty: 2 },
        { itemId: "1", product: SKU_B, qty: 4 },
      ],
      { division: "E", cusgroup: "98", region: "BANGKOK", promo, day: DAY }
    );
    const a = lookup.lines.find((l) => l.itemId === "0")!;
    const pooledRows = lookup.poolRows.get(a.poolKey)!;
    const tiersPooled = promoRowsToTiers(pooledRows);
    const text = getC4PromoForQty(a.pooledQty, tiersPooled);
    expect(text.currentPromo).toBe("ลด 140.00 บาท/หีบ");
    expect(text.currentPromo).toContain(String(a.discountBaht));
  });
});
