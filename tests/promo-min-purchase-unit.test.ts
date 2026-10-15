import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromotionCredit, tierMinQty } from "@/lib/fabric/promotion-credit";
import { lookupC4, promoRowsToTiers } from "@/lib/fabric/promotion-lookup";

/**
 * หน่วยของ MINIMUMPURCHASE (กติกาจากทีมข้อมูล 15 ต.ค. 69)
 *
 * - MINIMUMPURCHASE เป็นชิ้นเสมอ ทั้งโปรลดราคาและโปรของแถม
 * - PREMIUMUNIT เป็นหน่วยของของแถมอย่างเดียว (P ชิ้น / B หีบ)
 * - VDA ขายเป็นหีบ แถมเป็นหีบเต็มเท่านั้น
 *
 * เคสที่เจอจริง: 260927 ลด 46 บาท MINIMUMPURCHASE=12 (หีบละ 72 ชิ้น) — ร้านสั่ง 1 หีบ
 * ต้องได้ส่วนลด เดิมระบบอ่าน 12 เป็นหีบจึงไม่ให้
 */

const HEADER =
  "FROMDATE,TODATE,DIVISIONSALE,PRODUCTCODE,PURCHASEQUANTITYFROM,PURCHASEQUANTITYTO,PURCHASEUNIT,TOBREAKUP,COUNTRY,BANGKOK,CENTRAL,NORTHEAST,NORTH,SOUTH,CUSTOMERGROUP,DISCOUNTAMOUNT,DISCOUNTPERCENT,SPECIALUNITPRICE,MARKETINGUSER,PREMIUMPRODUCT,PREMIUMQUANTITY,PREMIUMUNIT,ASSORTEDPRODUCTGROUP,RECORDSTATUS,USERCODE,CREATEDATE,UpdateDate,MINIMUMPURCHASE";

function row(o: {
  product: string;
  fromQty: number;
  toQty: number;
  discAmt?: number;
  premiumProduct?: string;
  premiumQty?: number;
  premiumUnit?: "P" | "B";
  group?: string;
  minPurchase: number;
}): string {
  return [
    "2026-10-01T07:00:00.000+07:00",
    "2026-10-31T07:00:00.000+07:00",
    "E",
    o.product,
    o.fromQty.toFixed(1),
    o.toQty.toFixed(1),
    "B",
    o.minPurchase > 0 ? "Y" : "N",
    "Y",
    "N",
    "N",
    "N",
    "N",
    "N",
    "98",
    (o.discAmt ?? 0).toFixed(1),
    "0.0",
    "0.0",
    "MK101",
    o.premiumProduct ?? "",
    (o.premiumQty ?? 0).toFixed(1),
    o.premiumUnit ?? "",
    o.group ?? "",
    '""',
    "AM133",
    "2026-09-04T22:42:59.000+07:00",
    "2026-10-05 14:30:47",
    o.minPurchase.toFixed(1),
  ].join(",");
}

const DAY = new Date("2026-10-15T00:00:00+07:00");
const PACK: Record<string, number> = {
  "260927": 72,
  "500012": 12,
  "426163": 144,
  "540278": 80,
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-promo-minunit-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function load(rows: string[], withPack = true): PromotionCredit {
  const file = path.join(dir, "cft_promotion_cash.csv");
  fs.writeFileSync(file, [HEADER, ...rows].join("\n"), "utf-8");
  const p = new PromotionCredit();
  p.load(file);
  if (withPack) p.applyPackSizes((c) => PACK[c] ?? 1);
  return p;
}

function lookup(promo: PromotionCredit, product: string, qty: number) {
  return lookupC4([{ itemId: "0", product, qty }], {
    division: "E",
    cusgroup: "98",
    region: "BANGKOK",
    promo,
    day: DAY,
    packSizeOf: (c) => PACK[c] ?? 1,
  });
}

describe("MINIMUMPURCHASE ของโปรลดราคาเป็นชิ้น", () => {
  const r260927 = row({ product: "260927", fromQty: 1, toQty: 9999, discAmt: 46, minPurchase: 12 });

  it("260927: ขั้นต่ำ 12 ชิ้น หีบละ 72 — สั่ง 1 หีบได้ลด 46", () => {
    const promo = load([r260927]);
    expect(tierMinQty(promo.rowsFor("E", "98", "260927")[0]!)).toBe(1);
    expect(lookup(promo, "260927", 1).lines[0]?.discountBaht).toBe(46);
  });

  it("ขั้นต่ำเกินหนึ่งหีบ ปัดขึ้นเป็นหีบเต็ม (24 ชิ้น หีบละ 12 = 2 หีบ)", () => {
    const promo = load([
      row({ product: "500012", fromQty: 1, toQty: 9999, discAmt: 20, minPurchase: 24 }),
    ]);
    expect(lookup(promo, "500012", 1).lines).toHaveLength(0);
    expect(lookup(promo, "500012", 2).lines[0]?.discountBaht).toBe(20);
  });

  it("ยังไม่รู้ขนาดหีบ = ถอยไปใช้ตัวเลขเดิม (เข้มกว่า ไม่ให้ส่วนลดเกิน)", () => {
    const promo = load([r260927], false);
    expect(lookup(promo, "260927", 1).lines).toHaveLength(0);
    expect(lookup(promo, "260927", 12).lines[0]?.discountBaht).toBe(46);
  });
});

describe("โปรของแถม — ขั้นต่ำเป็นชิ้น แถมเป็นหีบเต็มเท่านั้น", () => {
  // BSWN: หีบละ 6 ชิ้น ขั้นต่ำ 24 ชิ้น (ไม่ถึงหีบ) ของแถม 429001 หีบละ 144 ชิ้น
  // → ได้สิทธิ์ตั้งแต่หีบแรก แต่แถมเป็นหีบเต็ม ต้องสะสมครบ 24 หีบ = 144 ชิ้น = 1 หีบ
  const bswn = row({
    product: "426163",
    fromQty: 1,
    toQty: 1,
    premiumProduct: "429001",
    premiumQty: 6,
    premiumUnit: "P",
    group: "BSWN",
    minPurchase: 24,
  });
  const PACK_429001 = 144;

  it("BSWN: 23 หีบยังไม่ได้แถม · 24 หีบ แถม 1 หีบ · 50 หีบ แถม 2 หีบ", () => {
    PACK["429001"] = PACK_429001;
    const promo = load([bswn]);
    expect(lookup(promo, "426163", 23).freeGoods).toHaveLength(0);
    const at24 = lookup(promo, "426163", 24).freeGoods[0]!;
    expect(at24.qty).toBe(1);
    expect(at24.unit).toBe("B");
    expect(lookup(promo, "426163", 50).freeGoods[0]!.qty).toBe(2);
  });

  it("ขั้นที่หน้าจอเห็นเริ่มที่ 24 หีบ แถม 1 หีบ — ตรงกับตัวเลขที่คิดจริง", () => {
    PACK["429001"] = PACK_429001;
    const promo = load([bswn]);
    const tiers = promoRowsToTiers(promo.rowsFor("E", "98", "426163"), {
      packSizeOf: (c) => PACK[c] ?? 1,
    });
    expect(tiers[0]).toMatchObject({ minQty: 24, premiumQty: 1, premiumUnit: "B" });
  });

  it("PREMIUMUNIT = B ไม่เกี่ยวกับขั้นต่ำ: ขั้นต่ำ 3 ชิ้น หีบละ 80 = 1 หีบ ได้แถม 1 หีบ", () => {
    const promo = load([
      row({
        product: "540278",
        fromQty: 1,
        toQty: 1,
        premiumProduct: "540278",
        premiumQty: 1,
        premiumUnit: "B",
        minPurchase: 3,
      }),
    ]);
    expect(tierMinQty(promo.rowsFor("E", "98", "540278")[0]!)).toBe(1);
    const res = lookup(promo, "540278", 1);
    expect(res.freeGoods[0]!.qty).toBe(1);
    expect(res.freeGoods[0]!.unit).toBe("B");
  });
});
