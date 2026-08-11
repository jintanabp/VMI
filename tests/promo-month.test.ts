import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromotionCredit } from "@/lib/fabric/promotion-credit";

/**
 * รายงานโปร C4 รายเดือนของหน้าแอดมิน
 *
 * สองอย่างที่เคยทำให้หน้ารายงานขัดกับหน้าสต็อกจริง และต้องกันไว้ไม่ให้กลับมา:
 *
 * 1. ไฟล์ C4 ที่ sync มามีแถวของ division อื่นปนอยู่ (เช่น Div.B) ซึ่งการ lookup
 *    ของหน้าร้านไม่มีทางแตะถึงเพราะผูกกับ (division, cusgroup, region) ของร้าน
 *    ถ้ารายงานโชว์หมด แอดมินจะเห็นโปรที่ร้านไม่มีวันได้ แล้วแจ้งว่าระบบพัง
 *
 * 2. ไฟล์เขียนอัตราของแถมเป็น "ต่อ 1 หีบ ได้ N ชิ้น" แล้วประกาศยอดขั้นต่ำแยกไว้ที่
 *    MINIMUMPURCHASE ส่วนแบบฟอร์มสั่งสินค้าเขียนรวบเป็น "คละ X หีบ ฟรี ... 1 หีบ"
 *    ข้อความในรายงานต้องตรงกับแบบฟอร์ม ไม่งั้นเทียบกันไม่ได้
 *
 * master ทั้งหมดถูก mock — ของจริงคือไฟล์ SKU 68MB ซึ่งทำให้เทสต์ช้าจนหมดเวลา
 * และผลลัพธ์จะผูกกับข้อมูลที่ sync มาวันนั้น ไม่ใช่ตรรกะที่กำลังทดสอบ
 */

const PROMO_HEADER =
  "FROMDATE,TODATE,DIVISIONSALE,PRODUCTCODE,PURCHASEQUANTITYFROM,PURCHASEQUANTITYTO,PURCHASEUNIT,TOBREAKUP,COUNTRY,BANGKOK,CENTRAL,NORTHEAST,NORTH,SOUTH,CUSTOMERGROUP,DISCOUNTAMOUNT,DISCOUNTPERCENT,SPECIALUNITPRICE,MARKETINGUSER,PREMIUMPRODUCT,PREMIUMQUANTITY,PREMIUMUNIT,ASSORTEDPRODUCTGROUP,RECORDSTATUS,USERCODE,CREATEDATE,UpdateDate,MINIMUMPURCHASE";

/** แถว C4 หนึ่งแถว — ระบุเฉพาะช่องที่เทสต์สนใจ ที่เหลือใส่ค่ากลาง ๆ ให้ผ่าน parser */
function promoRow(o: {
  division: string;
  product: string;
  cusgroup?: string;
  fromQty?: number;
  toQty?: number;
  discAmt?: number;
  premiumProduct?: string;
  premiumQty?: number;
  group?: string;
  minPurchase?: number;
  from?: string;
  to?: string;
}): string {
  return [
    o.from ?? "2026-08-01T07:00:00.000+07:00",
    o.to ?? "2026-08-31T07:00:00.000+07:00",
    o.division,
    o.product,
    (o.fromQty ?? 1).toFixed(1),
    (o.toQty ?? 1).toFixed(1),
    "B",
    "Y",
    "Y", // COUNTRY
    "N",
    "N",
    "N",
    "N",
    "N",
    o.cusgroup ?? "98",
    (o.discAmt ?? 0).toFixed(1),
    "0.0",
    "0.0",
    "MK102",
    o.premiumProduct ?? "",
    (o.premiumQty ?? 0).toFixed(1),
    o.premiumProduct ? "P" : "",
    o.group ?? "",
    '""',
    "AM132",
    "2026-07-10T23:28:12.000+07:00",
    "2026-08-11 14:30:38",
    (o.minPurchase ?? 1).toFixed(1),
  ].join(",");
}

let dir: string;

/** ชิ้นต่อหีบของ SKU ที่เป็นของแถม — ตั้งต่อเทสต์เพื่อคุมการแปลง ชิ้น → หีบ */
let packSizes: Record<string, number> = {};

beforeEach(() => {
  vi.resetModules();
  packSizes = {};
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-promo-month-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.resetModules();
  vi.restoreAllMocks();
});

function writePromoCsv(rows: string[]): PromotionCredit {
  const file = path.join(dir, "cft_promotion_cash.csv");
  fs.writeFileSync(file, [PROMO_HEADER, ...rows].join("\n"), "utf-8");
  const promo = new PromotionCredit();
  promo.load(file);
  return promo;
}

/** คลังจำลองที่ resolve เป็น Div.E / กลุ่มลูกค้า 98 / COUNTRY เหมือนของจริง */
async function loadReport(promo: PromotionCredit, stores: string[]) {
  vi.doMock("@/lib/fabric", () => ({
    fabricPromoReady: () => true,
    fabricSkuMasterReady: () => true,
    getPromotionCreditDirectory: () => promo,
    getAssortedMapping: () => ({ labelFor: (g: string) => g }),
    getSkuMasterDirectory: () => ({
      nameForSku: (code: string) => `สินค้า ${code}`,
      packSizeForSku: (code: string) => packSizes[code] ?? 1,
      getLookupPrice: () => ({ price: 540, expired: false }),
    }),
  }));
  vi.doMock("@/lib/fabric/stock-rows", () => ({
    listStockFromDbSources: () => stores,
  }));
  vi.doMock("@/lib/fabric/promotion-context", () => ({
    resolvePromoContext: (storeCode: string) => ({
      division: "E",
      cusgroup: "98",
      region: "COUNTRY",
      isVda: true,
      vdaCode: storeCode,
    }),
  }));
  const mod = await import("@/lib/promo/promo-month");
  return mod.buildPromoMonthReport({ day: new Date("2026-08-11T03:00:00Z") });
}

describe("buildPromoMonthReport", () => {
  it("ตัดแถวที่เป็น division อื่นออก เพราะไม่มีคลังไหน lookup ถึง", async () => {
    const promo = writePromoCsv([
      promoRow({ division: "E", product: "426577", discAmt: 20, group: "GX" }),
      promoRow({ division: "B", product: "426577", discAmt: 40, group: "GY" }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.totals.rows).toBe(1);
    expect(rep.totals.rowsOtherContext).toBe(1);
    expect(rep.groups).toHaveLength(1);
    expect(rep.groups[0].division).toBe("E");
    expect(rep.contexts).toEqual([
      { division: "E", cusgroup: "98", region: "COUNTRY", stores: ["vda1"] },
    ]);
  });

  it("กลุ่มลูกค้าอื่นก็ถูกตัดเหมือนกัน ไม่ใช่ดูแค่ division", async () => {
    const promo = writePromoCsv([
      promoRow({ division: "E", product: "426577", cusgroup: "98", discAmt: 20 }),
      promoRow({ division: "E", product: "426577", cusgroup: "99", discAmt: 40 }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.totals.rows).toBe(1);
    expect(rep.totals.rowsOtherContext).toBe(1);
    expect(rep.groups[0].cusgroup).toBe("98");
  });

  it("ไม่มีคลังในระบบ → ไม่กรอง ดีกว่าโชว์หน้าว่างโดยไม่บอกอะไร", async () => {
    const promo = writePromoCsv([
      promoRow({ division: "E", product: "426577", discAmt: 20 }),
      promoRow({ division: "B", product: "426577", discAmt: 40 }),
    ]);

    const rep = await loadReport(promo, []);

    expect(rep.totals.rows).toBe(2);
    expect(rep.totals.rowsOtherContext).toBe(0);
  });

  it("ของแถมเขียนเป็น «คละ X หีบ ฟรี ... N หีบ» ตามแบบฟอร์มสั่งสินค้า", async () => {
    // BSWN ของจริง: ต่อ 1 หีบ ได้ 6 ชิ้น ขั้นต่ำ 24 หีบ → 24 × 6 = 144 ชิ้น = 1 หีบ
    packSizes["429001"] = 144;
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426544",
        group: "BSWN",
        premiumProduct: "429001",
        premiumQty: 6,
        minPurchase: 24,
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.groups[0].minPurchase).toBe(24);
    expect(rep.groups[0].promoLabel).toBe(
      "คละ 24 หีบ ฟรี 429001 สินค้า 429001 1 หีบ"
    );
  });

  it("หารเป็นหีบไม่ลงตัว → บอกเป็นชิ้นตามต้นทาง ไม่ปัดให้ดูสวย", async () => {
    packSizes["429001"] = 144;
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426544",
        group: "BSWM",
        premiumProduct: "429001",
        premiumQty: 6,
        minPurchase: 5,
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.groups[0].promoLabel).toContain("คละ 5 หีบ");
    expect(rep.groups[0].promoLabel).toContain("30 ชิ้น");
  });

  it("แถวที่ไม่มีทั้งส่วนลดและของแถม ถือว่าไม่มีสิทธิประโยชน์", async () => {
    const promo = writePromoCsv([
      promoRow({ division: "E", product: "661108", fromQty: 1, toQty: 9999 }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.totals.noBenefitRows).toBe(1);
    expect(rep.groups[0].hasBenefit).toBe(false);
    expect(rep.groups[0].promoLabel).toBe("");
  });

  it("นับโปรที่ใช้ได้ช่วงใดก็ได้ในเดือน ไม่ใช่เฉพาะที่ active วันนี้", async () => {
    // 25 ก.ค. – 5 ส.ค. จบไปแล้วเมื่อเทียบกับวันที่ 11 ส.ค. แต่ยังทับซ้อนกับเดือน
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426577",
        discAmt: 20,
        from: "2026-07-25T07:00:00.000+07:00",
        to: "2026-08-05T07:00:00.000+07:00",
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.totals.rows).toBe(1);
    expect(rep.month).toBe("2026-08");
  });

  it("โปรที่จบก่อนเดือนนี้ ไม่ต้องเอามา", async () => {
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426577",
        discAmt: 20,
        from: "2026-06-01T07:00:00.000+07:00",
        to: "2026-07-31T07:00:00.000+07:00",
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.totals.rows).toBe(0);
    expect(rep.groups).toHaveLength(0);
  });
});
