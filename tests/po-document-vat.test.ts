import { describe, expect, it } from "vitest";
import { buildPoDocument, type PoDocumentLine } from "@/lib/po/po-document";

/**
 * VAT บนเอกสาร PO ต้องคิดตาม VatStatus ของสินค้า ไม่ใช่ 7% ทุกบรรทัด
 *
 * บั๊กที่เจอตอนเตรียมงานส่ง ERP: `buildPoDocument` คูณ 7% ทุกบรรทัดไม่มีเงื่อนไข
 * ทั้งที่ item master มีคอลัมน์ VatStatus อยู่แล้ว — นับจากไฟล์จริงเมื่อ 10 ก.ย. 2026:
 * `Y` 110,457 แถว · **`N` 125 แถว** · ว่าง 3 แถว ⇒ สินค้า 125 รหัสที่ไม่มี VAT
 * ถูกคิด VAT บนใบ PO มาตลอด
 */

function line(over: Partial<PoDocumentLine> = {}): Omit<
  PoDocumentLine,
  "amount" | "vatAmount"
> {
  return {
    skuCode: "744318",
    skuName: "สินค้าทดสอบ",
    qty: 1,
    unit: "case",
    unitPrice: 100,
    priceSource: "c4",
    discountBaht: null,
    discountPct: null,
    netUnitPrice: 100,
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

const build = (lines: Omit<PoDocumentLine, "amount" | "vatAmount">[]) =>
  buildPoDocument({
    poNumber: "V226091001A",
    groupKey: "A",
    priceKind: "c4",
    orderId: "order-1",
    storeCode: "vda2",
    storeName: "ร้านทดสอบ",
    approvedAt: new Date("2026-09-10T04:30:06.000Z"),
    approvedBy: "sales@example.com",
    deliveryDate: "2026-08-31",
    lines,
  });

describe("VAT บนเอกสาร PO", () => {
  it("สินค้ามี VAT → คิด 7%", () => {
    const doc = build([line()]);
    // ปัด 2 ตำแหน่งแล้ว — 100 * 0.07 ในเลขทศนิยมได้ 7.000000000000001
    expect(doc.lines[0]!.vatAmount).toBe(7);
    expect(doc.vatTotal).toBe(7);
    expect(doc.grandTotal).toBe(107);
  });

  it("**สินค้าไม่มี VAT → คิด 0** — นี่คือบั๊กที่เคยเกิด", () => {
    const doc = build([line({ vatStatus: "N" })]);
    expect(doc.lines[0]!.vatAmount).toBe(0);
    expect(doc.vatTotal).toBe(0);
    expect(doc.grandTotal).toBe(100);
  });

  it("master ไม่บอก (null) → เอกสารคิด 0 ไม่เดาว่ามี VAT", () => {
    // ใบแบบนี้ต้องถูกกันไม่ให้ส่ง ERP ด้วยเหตุผล vat_unknown (ดู tests/erp-payload.test.ts)
    const doc = build([line({ vatStatus: null })]);
    expect(doc.lines[0]!.vatAmount).toBe(0);
  });

  it("ใบที่มีทั้งสินค้ามีและไม่มี VAT รวมยอดถูกต้อง", () => {
    const doc = build([
      line({ netUnitPrice: 100, qty: 2 }),
      line({ skuCode: "999999", netUnitPrice: 50, qty: 1, vatStatus: "N" }),
    ]);
    expect(doc.totalAmount).toBe(250);
    expect(doc.vatTotal).toBe(14);
    expect(doc.grandTotal).toBe(264);
  });

  it("VatStatus ถูกแช่ไว้กับเอกสาร — อธิบายได้ว่า VAT คิดบนอะไร", () => {
    const doc = build([line({ vatStatus: "N" })]);
    expect(doc.lines[0]!.vatStatus).toBe("N");
  });
});
