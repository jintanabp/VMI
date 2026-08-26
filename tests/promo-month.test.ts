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
  /** PREMIUMUNIT = B (เป็นหีบอยู่แล้ว) แทนค่าปกติ P (ชิ้น) */
  premiumUnitB?: boolean;
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
    o.premiumProduct ? (o.premiumUnitB ? "B" : "P") : "",
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

  it("ไม่มีคลังในระบบ → ยังกรองด้วยบริบท default ไม่ใช่โชว์ทั้งไฟล์", async () => {
    // เดิมเคสนี้ปล่อยผ่านทั้งไฟล์ หน้าแอดมินจึงโชว์โปร Div. อื่นที่คลัง VDA ไม่มีวันได้
    const promo = writePromoCsv([
      promoRow({ division: "E", product: "426577", discAmt: 20 }),
      promoRow({ division: "B", product: "426577", discAmt: 40 }),
    ]);

    const rep = await loadReport(promo, []);

    expect(rep.totals.rows).toBe(1);
    expect(rep.totals.rowsOtherContext).toBe(1);
    expect(rep.groups[0].division).toBe("E");
    expect(rep.contexts).toEqual([
      { division: "E", cusgroup: "98", region: "COUNTRY", stores: [] },
    ]);
  });

  it("บอกบริบทที่มีในไฟล์ทั้งหมด — หลายบริบท = กำลังอ่านตารางผิดใบ", async () => {
    const promo = writePromoCsv([
      promoRow({ division: "E", product: "426577", cusgroup: "98", discAmt: 20 }),
      promoRow({ division: "B", product: "426577", cusgroup: "99", discAmt: 40 }),
      promoRow({ division: "W", product: "426578", cusgroup: "99", discAmt: 40 }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.fileContexts).toEqual(["E|98", "B|99", "W|99"]);
    // ตัวรายงานยังกรองเหลือบริบทของคลังตามเดิม ตัวเลขที่โชว์จึงไม่ปนกัน
    expect(rep.totals.rows).toBe(1);
  });

  it("ของแถมคิดต่อล็อต MINIMUMPURCHASE ไม่ใช่ต่อ 1 หีบ และบอกเป็นหีบ", async () => {
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
      promoRow({
        division: "E",
        product: "426551",
        group: "BSWN",
        premiumProduct: "429001",
        premiumQty: 6,
        minPurchase: 24,
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);
    const g = rep.groups[0];

    expect(g.minPurchase).toBe(24);
    // ขั้นบันไดต้องเป็นล็อต 24 หีบ ได้ 1 หีบ ไม่ใช่ 1 หีบ ได้ 6 ชิ้น
    expect(g.tiers[0].minQty).toBe(24);
    expect(g.tiers[0].premiumQty).toBe(1);
    expect(g.tiers[0].premiumUnit).toBe("B");
    // หลาย SKU ในกลุ่ม = รวมยอดกันได้ → ใช้คำว่า "คละ"
    expect(g.promoLabel).toBe("คละ 24 หีบ ฟรี 429001 สินค้า 429001 1 หีบ");
  });

  it("กลุ่มสินค้าเดียวใช้คำว่า «ซื้อ» ไม่ใช่ «คละ» เพราะไม่มีอะไรให้รวมยอด", async () => {
    packSizes["429001"] = 144;
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426544",
        premiumProduct: "429001",
        premiumQty: 6,
        minPurchase: 24,
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.groups[0].promoLabel).toBe(
      "ซื้อ 24 หีบ ฟรี 429001 สินค้า 429001 1 หีบ"
    );
  });

  it("หารเป็นหีบไม่ลงตัว → บอกเป็นชิ้นตามต้นทาง ไม่ปัดให้ดูสวย", async () => {
    // BSBSN ของจริง: ล็อต 6 หีบ ได้ 72 ชิ้น = ครึ่งหีบ โชว์ "0.5 หีบ" ไม่มีความหมาย
    packSizes["429001"] = 144;
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426544",
        group: "BSBSN",
        premiumProduct: "429001",
        premiumQty: 12,
        minPurchase: 6,
      }),
      promoRow({
        division: "E",
        product: "426551",
        group: "BSBSN",
        premiumProduct: "429001",
        premiumQty: 12,
        minPurchase: 6,
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    expect(rep.groups[0].tiers[0].premiumUnit).toBe("P");
    expect(rep.groups[0].promoLabel).toBe(
      "คละ 6 หีบ ฟรี 429001 สินค้า 429001 72 ชิ้น"
    );
  });

  it("PREMIUMUNIT ที่เป็น B อยู่แล้ว ห้ามหารด้วย packSize ซ้ำ", async () => {
    packSizes["429001"] = 12;
    const promo = writePromoCsv([
      promoRow({
        division: "E",
        product: "426544",
        premiumProduct: "429001",
        premiumQty: 1,
        premiumUnitB: true,
        minPurchase: 5,
      }),
    ]);

    const rep = await loadReport(promo, ["vda1"]);

    // 1 หีบ/หีบ × ล็อต 5 = 5 หีบ — ถ้าเผลอหารด้วย packSize จะได้ 0.42 หีบ
    expect(rep.groups[0].tiers[0].premiumQty).toBe(5);
    expect(rep.groups[0].tiers[0].premiumUnit).toBe("B");
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
