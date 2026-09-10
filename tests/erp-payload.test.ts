import { describe, expect, it } from "vitest";
import {
  buildErpPayload,
  checkErpReadiness,
  erpReasonLabel,
  DEFAULT_DIVISION_CODE,
  ERP_ORDER_NO_MAX,
  type ErpPayloadContext,
  type ErpReason,
} from "@/lib/po/erp-payload";
import { buildPoDocument, type PoDocumentLine } from "@/lib/po/po-document";

/**
 * payload ที่จะส่งเข้า ERP `insertOCROrderToBill`
 *
 * ปลายทางเป็น Oracle ตัวเดียวกับที่ระบบ ocr-po-matching ใช้ และ**ตอบ 400 พร้อมล็อก
 * คู่ orderNo+customerCode ไว้ 6 เดือน**เมื่อส่งซ้ำ ⇒ รูปร่าง payload ผิดครั้งเดียว
 * คือเผาเลข PO ทิ้ง เทสต์ชุดนี้จึงล็อกทั้งชื่อฟิลด์และกติกาที่สเปกเขียนไว้
 *
 * ตัวอย่างอ้างอิง: ocr-po-matching/Spec API/ocr-insertOCROrderToBill.md
 */

const ctx: ErpPayloadContext = {
  customerCode: "3231847",
  salesmanCode: "S545",
  divisionCode: DEFAULT_DIVISION_CODE,
  createDate: "2026-09-10 11:30:06",
  deliveryDate: "2026-09-13 00:00:00",
};

function line(over: Partial<PoDocumentLine> = {}): Omit<
  PoDocumentLine,
  "amount" | "vatAmount"
> {
  return {
    skuCode: "744318",
    skuName: "สินค้าทดสอบ",
    qty: 2,
    unit: "case",
    unitPrice: 403.74,
    priceSource: "c4",
    discountBaht: null,
    discountPct: null,
    netUnitPrice: 403.74,
    promoGroup: null,
    promoGroupMembers: null,
    promoLabel: null,
    freeGood: null,
    vatStatus: "Y",
    priceFlagged: false,
    priceFlagReason: null,
    ...over,
  };
}

function doc(
  lines: Omit<PoDocumentLine, "amount" | "vatAmount">[] = [line()],
  over: { poNumber?: string; priceKind?: "c4" | "override" | "mixed" } = {}
) {
  return buildPoDocument({
    poNumber: over.poNumber ?? "V226091001A",
    groupKey: "A",
    priceKind: over.priceKind ?? "c4",
    orderId: "order-1",
    storeCode: "vda2",
    storeName: "ร้านทดสอบ",
    approvedAt: new Date("2026-09-10T04:30:06.000Z"),
    approvedBy: "sales@example.com",
    lines,
  });
}

describe("buildErpPayload", () => {
  it("ชื่อฟิลด์ทุกตัวตรงกับสเปกของปลายทาง", () => {
    const p = buildErpPayload(doc(), ctx);
    expect(Object.keys(p).sort()).toEqual(
      [
        "countItem",
        "createDate",
        "customerCode",
        "deliveryDate",
        "divisionCode",
        "orderDetail",
        "orderNo",
        "salesmanCode",
      ].sort()
    );
    expect(Object.keys(p.orderDetail[0]!).sort()).toEqual(
      [
        "amount",
        "buyOrFree",
        "discountPercent",
        "discountUnit",
        "productCode",
        "promotionTo",
        "quantityCase",
        "quantityUnit",
        "unitPrice",
        "vatAmount",
      ].sort()
    );
  });

  it("**ไม่ส่ง isSpecial / isErrorC4 เลย** — ผู้ใช้สั่งห้ามใช้", () => {
    const p = buildErpPayload(doc(), ctx) as unknown as Record<string, unknown>;
    expect("isSpecial" in p).toBe(false);
    expect("isErrorC4" in p).toBe(false);
  });

  it("countItem ต้องเท่ากับจำนวนบรรทัดที่ส่งจริงเสมอ", () => {
    const p = buildErpPayload(doc([line(), line({ skuCode: "744326" })]), ctx);
    expect(p.countItem).toBe(2);
    expect(p.countItem).toBe(p.orderDetail.length);
  });

  it("**ไม่มีบรรทัด F แม้แถวนั้นมีของแถม** — ออเดอร์ปกติห้ามส่งของแถม", () => {
    const withFree = line({
      freeGood: { code: "744334", name: "ของแถม", qty: 1, unit: "หีบ" },
    });
    const p = buildErpPayload(doc([withFree]), ctx);
    expect(p.orderDetail).toHaveLength(1);
    expect(p.orderDetail.every((d) => d.buyOrFree === "B")).toBe(true);
  });

  it("จำนวนส่งเป็นจำนวนเต็มหีบเสมอ และ amount คิดจากจำนวนที่ส่งจริง", () => {
    const p = buildErpPayload(doc([line({ qty: 2.4, netUnitPrice: 100 })]), ctx);
    expect(p.orderDetail[0]!.quantityCase).toBe(2);
    expect(p.orderDetail[0]!.amount).toBe(200);
  });

  it("VAT: Y คิด 7% · N คิด 0", () => {
    const yes = buildErpPayload(doc([line({ netUnitPrice: 100, qty: 1 })]), ctx);
    expect(yes.orderDetail[0]!.vatAmount).toBe(7);

    const no = buildErpPayload(
      doc([line({ netUnitPrice: 100, qty: 1, vatStatus: "N" })]),
      ctx
    );
    expect(no.orderDetail[0]!.vatAmount).toBe(0);
  });

  it("ส่วนลดลงช่องให้ถูกตัว — บาทต่อหีบไป discountUnit, % ไป discountPercent", () => {
    const p = buildErpPayload(
      doc([line({ discountBaht: 42, discountPct: 3.5 })]),
      ctx
    );
    expect(p.orderDetail[0]!.discountUnit).toBe(42);
    expect(p.orderDetail[0]!.discountPercent).toBe(3.5);
  });

  it("ไม่มีส่วนลด = ส่ง 0 ไม่ใช่ null (ปลายทาง default เป็น 0)", () => {
    const p = buildErpPayload(doc(), ctx);
    expect(p.orderDetail[0]!.discountUnit).toBe(0);
    expect(p.orderDetail[0]!.discountPercent).toBe(0);
  });

  it("หน่วยเป็นหีบเสมอ และ promotionTo ชี้กลับที่ตัวเอง", () => {
    const p = buildErpPayload(doc(), ctx);
    expect(p.orderDetail[0]!.quantityUnit).toBe("B");
    expect(p.orderDetail[0]!.promotionTo).toBe(p.orderDetail[0]!.productCode);
  });

  it("orderNo ใช้เลขลูกของ PO ใบนั้น ไม่ใช่เลขแม่", () => {
    const p = buildErpPayload(doc([line()], { poNumber: "V226091001B" }), ctx);
    expect(p.orderNo).toBe("V226091001B");
    expect(p.orderNo.length).toBeLessThanOrEqual(ERP_ORDER_NO_MAX);
  });
});

describe("checkErpReadiness", () => {
  const reasonsOf = (r: { reasons: ErpReason[] }) => r.reasons;

  it("ใบที่ครบทุกอย่างต้องผ่าน", () => {
    expect(checkErpReadiness(doc(), ctx).ok).toBe(true);
  });

  it("**ยังไม่รู้วันส่งของ = ยังส่งไม่ได้** (รอทีม ERP ตอบ)", () => {
    const r = checkErpReadiness(doc(), { ...ctx, deliveryDate: null });
    expect(r.ok).toBe(false);
    expect(reasonsOf(r)).toContain("missing_delivery_date");
  });

  it("VAT ไม่รู้ = กันทั้งใบ และบอกว่ารหัสไหนเป็นต้นเหตุ", () => {
    const r = checkErpReadiness(
      doc([line(), line({ skuCode: "999999", vatStatus: null })]),
      ctx
    );
    expect(r.ok).toBe(false);
    expect(reasonsOf(r)).toContain("vat_unknown");
    expect(r.offendingSkus.vat_unknown).toEqual(["999999"]);
  });

  it("ราคาไม่ตรง C4 ต้องติดธง เพราะปลายทางจะคิดโปรใหม่", () => {
    expect(reasonsOf(checkErpReadiness(doc([line()], { priceKind: "override" }), ctx))).toContain(
      "price_off_c4"
    );
    expect(reasonsOf(checkErpReadiness(doc([line()], { priceKind: "mixed" }), ctx))).toContain(
      "price_off_c4"
    );
  });

  it("ข้อมูลคลังไม่ครบ = บอกทีละช่อง", () => {
    const r = checkErpReadiness(doc(), {
      ...ctx,
      customerCode: "",
      salesmanCode: "  ",
      divisionCode: "",
    });
    expect(reasonsOf(r)).toEqual(
      expect.arrayContaining([
        "missing_customer_code",
        "missing_salesman_code",
        "missing_division",
      ])
    );
  });

  it("เลข PO ผิดรูป (เกิน 12 ตัว / มีอักขระอื่น) ต้องไม่ทำให้ทั้งหน้าล้ม", () => {
    expect(
      reasonsOf(checkErpReadiness(doc([line()], { poNumber: "V2260910011234" }), ctx))
    ).toContain("po_number_invalid");
    expect(
      reasonsOf(checkErpReadiness(doc([line()], { poNumber: "V2-2609" }), ctx))
    ).toContain("po_number_invalid");
  });

  it("จำนวน 0 หรือปัดแล้วเป็น 0 = ส่งไม่ได้", () => {
    expect(reasonsOf(checkErpReadiness(doc([line({ qty: 0 })]), ctx))).toContain(
      "qty_not_positive_integer"
    );
    expect(reasonsOf(checkErpReadiness(doc([line({ qty: 0.4 })]), ctx))).toContain(
      "qty_not_positive_integer"
    );
  });

  it("ไม่มีราคา = ส่งไม่ได้", () => {
    expect(
      reasonsOf(
        checkErpReadiness(doc([line({ unitPrice: null, netUnitPrice: null })]), ctx)
      )
    ).toContain("missing_unit_price");
  });

  it("ใบเปล่า = ส่งไม่ได้", () => {
    expect(reasonsOf(checkErpReadiness(doc([]), ctx))).toContain("empty_lines");
  });

  it("ทุกเหตุผลมีข้อความไทยบอกทางแก้ ไม่มี code โผล่ขึ้นจอ", () => {
    const all: ErpReason[] = [
      "missing_po_number",
      "po_number_invalid",
      "missing_customer_code",
      "missing_salesman_code",
      "missing_division",
      "missing_delivery_date",
      "empty_lines",
      "vat_unknown",
      "qty_not_positive_integer",
      "missing_unit_price",
      "price_off_c4",
    ];
    for (const r of all) {
      expect(erpReasonLabel(r)).toBeTruthy();
      expect(erpReasonLabel(r)).not.toContain("_");
    }
  });
});
